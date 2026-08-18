-- ============================================================================
-- MIGRATION: Remoção do frete fixo de R$ 19,90 e preparação para frete por CEP
-- ============================================================================

-- 1. Flexibilizar constraint de regiao_frete para não restringir apenas a Sul/Sudeste/Brasil
alter table public.pedidos
  drop constraint if exists pedidos_regiao_frete_check;

alter table public.pedidos
  add constraint pedidos_regiao_frete_check
  check (regiao_frete is null or length(regiao_frete) <= 100);

-- 2. Atualizar função de persistência de entrega no checkout
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
  v_cep text;
  v_endereco text;
  v_numero text;
  v_complemento text;
  v_bairro text;
  v_cidade text;
  v_estado text;
  v_entrega_existente record;
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

  v_pedido := public.criar_pedido_checkout(
    p_user_id,
    p_email_cliente,
    p_cliente,
    p_itens,
    p_cupom,
    p_idempotency_key
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
  else
    -- Regra 2: Frete abaixo de R$ 400 calculado por CEP
    if p_entrega ? 'valor_frete' and (p_entrega->>'valor_frete') ~ '^[0-9]+(\.[0-9]{1,2})?$' then
      v_valor_frete := (p_entrega->>'valor_frete')::numeric;
      v_regiao_frete := coalesce(nullif(btrim(p_entrega->>'regiao_frete'), ''), v_estado);
    else
      raise exception 'Consulte o frete para o CEP % (%)', v_cep, v_estado
        using errcode = 'P0001';
    end if;
  end if;

  update public.pedidos
  set valor_frete = v_valor_frete,
      regiao_frete = v_regiao_frete,
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

revoke all privileges on function public.salvar_entrega_pedido_checkout(uuid, text, text, jsonb, text, text, jsonb) from public;
grant execute on function public.salvar_entrega_pedido_checkout(uuid, text, text, jsonb, text, text, jsonb) to service_role;
