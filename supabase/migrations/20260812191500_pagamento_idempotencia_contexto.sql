begin;

create or replace function public.criar_pedido_pagamento(
  p_user_id uuid,
  p_email_cliente text,
  p_cliente text,
  p_itens jsonb,
  p_cupom text,
  p_idempotency_key uuid,
  p_entrega jsonb,
  p_forma_pagamento text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pedido jsonb;
  v_pedido_id bigint;
  v_numero text;
  v_existente public.pedidos%rowtype;
  v_ja_existia boolean;
  -- O Pix vence em 30 minutos no provedor. A reserva ganha margem para
  -- a notificacao chegar antes de entrar na fila de reconciliacao.
  v_expira_em timestamptz := now() + interval '40 minutes';
begin
  if p_forma_pagamento not in ('Pix', 'Cartão de crédito') then
    raise exception 'Forma de pagamento inválida'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.pedidos
    where idempotency_key = p_idempotency_key
  )
  into v_ja_existia;

  -- Esta chamada e obrigatoria inclusive no retry. A RPC base serializa
  -- concorrencia pela idempotency_key e compara user_id, e-mail, cliente,
  -- cupom, produto, tamanho e quantidade. A sobrecarga de frete compara
  -- toda a entrega e recalcula frete/total a partir dos valores persistidos.
  v_pedido := public.criar_pedido_checkout(
    p_user_id,
    p_email_cliente,
    p_cliente,
    p_itens,
    p_cupom,
    p_idempotency_key,
    p_entrega
  );

  v_pedido_id := nullif(v_pedido->>'id', '')::bigint;

  if v_pedido_id is null then
    raise exception 'A RPC de checkout não retornou o id do pedido'
      using errcode = 'P0001';
  end if;

  select *
  into v_existente
  from public.pedidos
  where id = v_pedido_id
  for update;

  if not found then
    raise exception 'Pedido criado não encontrado'
      using errcode = 'P0001';
  end if;

  -- v_ja_existia protege pedidos legados sem forma de pagamento.
  -- forma_pagamento preenchida identifica tambem um concorrente que concluiu
  -- a inicializacao enquanto esta chamada aguardava o lock da RPC base.
  if v_ja_existia or v_existente.forma_pagamento is not null then
    if v_existente.forma_pagamento is null
      or v_existente.forma_pagamento <> p_forma_pagamento then
      raise exception 'idempotency_context_mismatch'
        using errcode = '23505';
    end if;

    return to_jsonb(v_existente) || jsonb_build_object(
      'itens', (
        select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)
        from public.pedido_itens i
        where i.pedido_id = v_existente.id
      )
    );
  end if;

  v_numero := v_existente.numero;

  update public.pedidos
  set status = 'Aguardando pagamento',
      forma_pagamento = p_forma_pagamento,
      status_pagamento = 'pendente',
      pagamento_provider = 'mercado_pago',
      pagamento_external_reference = v_numero,
      pagamento_idempotency_key = p_idempotency_key,
      pagamento_consulta_token = gen_random_uuid(),
      pagamento_atualizado_em = now(),
      reserva_status = 'reservado',
      reserva_expira_em = v_expira_em
  where id = v_pedido_id;

  insert into public.reservas_estoque (
    pedido_id,
    pedido_item_id,
    produto_id,
    produto_tamanho_id,
    tamanho,
    quantidade,
    expires_at
  )
  select
    item.pedido_id,
    item.id,
    item.produto_id,
    tamanho.id,
    item.tamanho,
    item.quantidade,
    v_expira_em
  from public.pedido_itens item
  left join public.produto_tamanhos tamanho
    on tamanho.produto_id = item.produto_id
   and tamanho.tamanho = item.tamanho
  where item.pedido_id = v_pedido_id
  on conflict (pedido_item_id) do nothing;

  select *
  into v_existente
  from public.pedidos
  where id = v_pedido_id;

  return v_pedido || to_jsonb(v_existente) || jsonb_build_object(
    'itens', (
      select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)
      from public.pedido_itens i
      where i.pedido_id = v_pedido_id
    )
  );
end;
$function$;

revoke all privileges on function public.criar_pedido_pagamento(
  uuid,
  text,
  text,
  jsonb,
  text,
  uuid,
  jsonb,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.criar_pedido_pagamento(
  uuid,
  text,
  text,
  jsonb,
  text,
  uuid,
  jsonb,
  text
) to service_role;

commit;
