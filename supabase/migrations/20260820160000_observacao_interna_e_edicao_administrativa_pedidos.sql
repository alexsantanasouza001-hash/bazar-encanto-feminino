begin;

alter table public.pedidos
  add column if not exists observacao_interna text;

alter table public.pedidos
  drop constraint if exists pedidos_observacao_interna_tamanho_check;

alter table public.pedidos
  add constraint pedidos_observacao_interna_tamanho_check
  check (observacao_interna is null or length(observacao_interna) <= 1000) not valid;

drop function if exists public.atualizar_pedido_pos_venda(bigint, text, text, text, text, text);
drop function if exists public.atualizar_pedido_pos_venda(bigint, text, text, text, text, text, text);

create or replace function public.atualizar_pedido_pos_venda(
  p_pedido_id bigint,
  p_novo_status text,
  p_transportadora text default null,
  p_codigo_rastreio text default null,
  p_url_rastreio text default null,
  p_observacao_envio text default null,
  p_observacao_interna text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pedido public.pedidos%rowtype;
  v_status_atual text;
  v_novo_status text := nullif(btrim(p_novo_status), '');
  v_transportadora text := nullif(btrim(p_transportadora), '');
  v_codigo_rastreio text := nullif(btrim(p_codigo_rastreio), '');
  v_url_rastreio text := nullif(btrim(p_url_rastreio), '');
  v_observacao text := nullif(btrim(p_observacao_envio), '');
  v_observacao_interna text := coalesce(nullif(btrim(p_observacao_interna), ''), nullif(btrim(p_observacao_envio), ''));
  v_transicao_valida boolean := false;
  v_role text;
begin
  v_role := coalesce(auth.jwt()->'app_metadata'->>'role', '');
  if v_role not in ('admin', 'socio') then
    raise exception 'Acesso não autorizado'
      using errcode = '42501';
  end if;

  if p_pedido_id is null or p_pedido_id <= 0 then
    raise exception 'Pedido inválido' using errcode = '22023';
  end if;

  if v_novo_status is null or v_novo_status not in (
    'Aguardando pagamento', 'Confirmado', 'Em preparação', 'Enviado',
    'Entregue', 'Concluído', 'Cancelado'
  ) then
    raise exception 'Status de pedido inválido' using errcode = '22023';
  end if;

  if length(coalesce(v_transportadora, '')) > 120
    or length(coalesce(v_codigo_rastreio, '')) > 120
    or length(coalesce(v_url_rastreio, '')) > 500
    or length(coalesce(v_observacao, '')) > 500
    or length(coalesce(v_observacao_interna, '')) > 1000 then
    raise exception 'Dados administrativos excedem o limite permitido'
      using errcode = '22023';
  end if;

  if v_url_rastreio is not null and v_url_rastreio !~ '^https://' then
    raise exception 'A URL de rastreio deve usar HTTPS'
      using errcode = '22023';
  end if;

  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado' using errcode = 'P0001';
  end if;

  v_status_atual := case lower(btrim(v_pedido.status))
    when 'novo' then 'Confirmado'
    when 'confirmada' then 'Confirmado'
    when 'em preparacao' then 'Em preparação'
    when 'concluido' then 'Concluído'
    else v_pedido.status
  end;

  v_transicao_valida :=
    v_status_atual = v_novo_status
    or (v_status_atual = 'Aguardando pagamento' and v_novo_status in ('Confirmado', 'Cancelado'))
    or (v_status_atual = 'Confirmado' and v_novo_status in ('Em preparação', 'Cancelado'))
    or (v_status_atual = 'Em preparação' and v_novo_status in ('Enviado', 'Cancelado'))
    or (v_status_atual = 'Enviado' and v_novo_status in ('Entregue', 'Cancelado'))
    or (v_status_atual = 'Entregue' and v_novo_status in ('Concluído', 'Cancelado'));

  if not v_transicao_valida then
    raise exception 'Transição de status não permitida: % -> %',
      v_status_atual, v_novo_status
      using errcode = '22023';
  end if;

  if v_novo_status = 'Enviado' and v_pedido.status_pagamento is distinct from 'aprovado' then
    raise exception 'Somente pedidos com pagamento aprovado podem ser enviados'
      using errcode = '22023';
  end if;

  if v_novo_status = 'Cancelado'
    and v_pedido.status_pagamento = 'pendente'
    and v_pedido.reserva_status = 'reservado' then
    perform public.liberar_reserva_pedido(
      p_pedido_id,
      'Cancelamento administrativo do pedido'
    );
  end if;

  update public.pedidos
  set status = v_novo_status,
      status_pagamento = case
        when v_novo_status = 'Cancelado'
          and status_pagamento = 'pendente'
          then 'cancelado'
        else status_pagamento
      end,
      transportadora = coalesce(v_transportadora, transportadora),
      codigo_rastreio = coalesce(v_codigo_rastreio, codigo_rastreio),
      url_rastreio = coalesce(v_url_rastreio, url_rastreio),
      observacao_envio = coalesce(v_observacao, observacao_envio),
      observacao_interna = coalesce(v_observacao_interna, observacao_interna),
      enviado_em = case
        when v_novo_status = 'Enviado' then coalesce(enviado_em, now())
        else enviado_em
      end,
      entregue_em = case
        when v_novo_status = 'Entregue' then coalesce(entregue_em, now())
        else entregue_em
      end,
      atualizado_em = now()
  where id = p_pedido_id;

  return (
    select to_jsonb(p) || jsonb_build_object(
      'itens', coalesce((
        select jsonb_agg(to_jsonb(i) order by i.id)
        from public.pedido_itens i
        where i.pedido_id = p.id
      ), '[]'::jsonb)
    )
    from public.pedidos p
    where p.id = p_pedido_id
  );
end;
$function$;

revoke all privileges on function public.atualizar_pedido_pos_venda(
  bigint, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.atualizar_pedido_pos_venda(
  bigint, text, text, text, text, text, text
) to authenticated;

commit;
