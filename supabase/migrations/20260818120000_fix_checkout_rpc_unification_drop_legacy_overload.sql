-- ====================================================================
-- MIGRATION: ELIMINAÇÃO DE OVERLOAD AMBÍGUO E UNIFICAÇÃO DO CHECKOUT MULTICOR
-- BAZAR ENCANTO FEMININO
-- ====================================================================

begin;

-- 1. REMOVER A ASSINATURA LEGADA DE 7 PARÂMETROS DE CRIAR_PEDIDO_CHECKOUT
-- Esta função legada de frete fixo interceptava chamadas de 7 parâmetros
-- e causava ambiguidade com a nova RPC multicor de 6 parâmetros.
drop function if exists public.criar_pedido_checkout(uuid, text, text, jsonb, text, uuid, jsonb);

-- 2. GARANTIR QUE SALVAR_ENTREGA_PEDIDO_CHECKOUT CHAME A RPC MULTICOR DE 6 PARÂMETROS
create or replace function public.salvar_entrega_pedido_checkout(
  p_user_id uuid,
  p_email_cliente text,
  p_cliente text,
  p_itens jsonb,
  p_cupom text,
  p_idempotency_key text,
  p_entrega jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido jsonb;
  v_pedido_id bigint;
  v_subtotal numeric;
  v_desconto numeric;
  v_base_frete_gratis numeric;
  v_valor_frete numeric;
  v_regiao_frete text;
  v_servico_frete text;
  v_transportadora_frete text;
  v_prazo_frete text;
  v_cep text;
  v_endereco text;
  v_numero text;
  v_complemento text;
  v_bairro text;
  v_cidade text;
  v_estado text;
  v_entrega_existente record;
  v_idempotency_uuid uuid;
begin
  if p_entrega is null
    or jsonb_typeof(p_entrega) <> 'object' then
    raise exception 'Dados de entrega inválidos'
      using errcode = '22023';
  end if;

  v_cep := regexp_replace(coalesce(p_entrega->>'cep', ''), '[^0-9]', '', 'g');
  v_endereco := nullif(btrim(p_entrega->>'endereco'), '');
  v_numero := nullif(btrim(p_entrega->>'numero'), '');
  v_complemento := nullif(btrim(p_entrega->>'complemento'), '');
  v_bairro := nullif(btrim(p_entrega->>'bairro'), '');
  v_cidade := nullif(btrim(p_entrega->>'cidade'), '');
  v_estado := upper(nullif(btrim(p_entrega->>'estado'), ''));

  if v_cep !~ '^[0-9]{8}$'
    or v_endereco is null
    or v_numero is null
    or v_bairro is null
    or v_cidade is null
    or v_estado is null
    or v_estado !~ '^[A-Z]{2}$' then
    raise exception 'Endereço de entrega incompleto ou inválido'
      using errcode = '22023';
  end if;

  if length(v_endereco) > 300
    or length(v_numero) > 30
    or length(coalesce(v_complemento, '')) > 150
    or length(v_bairro) > 150
    or length(v_cidade) > 150 then
    raise exception 'Endereço de entrega excede o limite permitido'
      using errcode = '22023';
  end if;

  v_idempotency_uuid := p_idempotency_key::uuid;

  -- Chama explicitamente a RPC multicor de 6 parâmetros
  v_pedido := public.criar_pedido_checkout(
    p_user_id,
    p_email_cliente,
    p_cliente,
    p_itens,
    p_cupom,
    v_idempotency_uuid
  );

  v_pedido_id := nullif(v_pedido->>'id', '')::bigint;

  if v_pedido_id is null then
    raise exception 'A RPC de checkout não retornou o id do pedido'
      using errcode = 'P0001';
  end if;

  select
    subtotal,
    desconto,
    cep_entrega,
    endereco_entrega,
    numero_entrega,
    complemento_entrega,
    bairro_entrega,
    cidade_entrega,
    estado_entrega
  into v_entrega_existente
  from public.pedidos
  where id = v_pedido_id
  for update;

  if v_entrega_existente.cep_entrega is not null
    and (
      v_entrega_existente.cep_entrega is distinct from v_cep
      or v_entrega_existente.endereco_entrega is distinct from v_endereco
      or v_entrega_existente.numero_entrega is distinct from v_numero
      or v_entrega_existente.complemento_entrega is distinct from v_complemento
      or v_entrega_existente.bairro_entrega is distinct from v_bairro
      or v_entrega_existente.cidade_entrega is distinct from v_cidade
      or v_entrega_existente.estado_entrega is distinct from v_estado
    ) then
    raise exception 'idempotency_key já utilizada por outro pedido'
      using errcode = 'P0001';
  end if;

  v_subtotal := coalesce(v_entrega_existente.subtotal, 0);
  v_desconto := coalesce(v_entrega_existente.desconto, 0);
  v_base_frete_gratis := greatest(0, v_subtotal - v_desconto);

  -- Regra 1: Frete Grátis para todo o Brasil a partir de R$ 400
  if v_base_frete_gratis >= 400 then
    v_valor_frete := 0;
    v_regiao_frete := 'Brasil';
    v_servico_frete := 'Frete Grátis';
    v_transportadora_frete := 'Bazar Encanto';
    v_prazo_frete := 'Prazo padrão';
  else
    -- Regra 2: Frete calculado por CEP
    if p_entrega ? 'valor_frete' and (p_entrega->>'valor_frete') ~ '^[0-9]+(\.[0-9]{1,2})?$' then
      v_valor_frete := (p_entrega->>'valor_frete')::numeric;
      v_regiao_frete := coalesce(nullif(btrim(p_entrega->>'regiao_frete'), ''), v_estado);
      v_servico_frete := nullif(btrim(p_entrega->>'servico_frete'), '');
      v_transportadora_frete := nullif(btrim(p_entrega->>'transportadora_frete'), '');
      v_prazo_frete := nullif(btrim(p_entrega->>'prazo_frete'), '');
    else
      raise exception 'Consulte o frete para o CEP % (%)', v_cep, v_estado
        using errcode = 'P0001';
    end if;
  end if;

  update public.pedidos
  set valor_frete = v_valor_frete,
      regiao_frete = v_regiao_frete,
      servico_frete = v_servico_frete,
      transportadora_frete = v_transportadora_frete,
      prazo_frete = v_prazo_frete,
      cep_entrega = v_cep,
      endereco_entrega = v_endereco,
      numero_entrega = v_numero,
      complemento_entrega = v_complemento,
      bairro_entrega = v_bairro,
      cidade_entrega = v_cidade,
      estado_entrega = v_estado,
      total = v_base_frete_gratis + v_valor_frete
  where id = v_pedido_id;

  return v_pedido || jsonb_build_object(
    'valor_frete', v_valor_frete,
    'regiao_frete', v_regiao_frete,
    'servico_frete', v_servico_frete,
    'transportadora_frete', v_transportadora_frete,
    'prazo_frete', v_prazo_frete,
    'cep_entrega', v_cep,
    'endereco_entrega', v_endereco,
    'numero_entrega', v_numero,
    'complemento_entrega', v_complemento,
    'bairro_entrega', v_bairro,
    'cidade_entrega', v_cidade,
    'estado_entrega', v_estado,
    'total', v_base_frete_gratis + v_valor_frete
  );
end;
$$;

-- 3. REAFIRMAR CRIAR_PEDIDO_PAGAMENTO CHAMANDO SALVAR_ENTREGA_PEDIDO_CHECKOUT
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

  -- Chama salvar_entrega_pedido_checkout que executa a RPC multicor de 6 parâmetros
  v_pedido := public.salvar_entrega_pedido_checkout(
    p_user_id,
    p_email_cliente,
    p_cliente,
    p_itens,
    p_cupom,
    p_idempotency_key::text,
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
    variacao_id,
    cor,
    tamanho,
    quantidade,
    expires_at
  )
  select
    item.pedido_id,
    item.id,
    item.produto_id,
    item.produto_tamanho_id,
    item.variacao_id,
    item.cor,
    item.tamanho,
    item.quantidade,
    v_expira_em
  from public.pedido_itens item
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

-- 4. GRANTS
revoke all privileges on function public.salvar_entrega_pedido_checkout(uuid, text, text, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_entrega_pedido_checkout(uuid, text, text, jsonb, text, text, jsonb) to service_role;

revoke all privileges on function public.criar_pedido_pagamento(uuid, text, text, jsonb, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.criar_pedido_pagamento(uuid, text, text, jsonb, text, uuid, jsonb, text) to service_role;

commit;
