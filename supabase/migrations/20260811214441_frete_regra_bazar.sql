begin;

alter table public.pedidos
  add column if not exists valor_frete numeric not null default 0,
  add column if not exists regiao_frete text,
  add column if not exists cep_entrega text,
  add column if not exists endereco_entrega text,
  add column if not exists numero_entrega text,
  add column if not exists complemento_entrega text,
  add column if not exists bairro_entrega text,
  add column if not exists cidade_entrega text,
  add column if not exists estado_entrega text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_valor_frete_nao_negativo_check'
      and conrelid = 'public.pedidos'::regclass
  ) then
    alter table public.pedidos
      add constraint pedidos_valor_frete_nao_negativo_check
      check (valor_frete >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_regiao_frete_check'
      and conrelid = 'public.pedidos'::regclass
  ) then
    alter table public.pedidos
      add constraint pedidos_regiao_frete_check
      check (
        regiao_frete is null
        or regiao_frete in ('Brasil', 'Sul', 'Sudeste')
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_cep_entrega_check'
      and conrelid = 'public.pedidos'::regclass
  ) then
    alter table public.pedidos
      add constraint pedidos_cep_entrega_check
      check (cep_entrega is null or cep_entrega ~ '^[0-9]{8}$') not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_estado_entrega_check'
      and conrelid = 'public.pedidos'::regclass
  ) then
    alter table public.pedidos
      add constraint pedidos_estado_entrega_check
      check (estado_entrega is null or estado_entrega ~ '^[A-Z]{2}$') not valid;
  end if;
end
$$;

do $$
declare
  v_funcao regprocedure;
  v_retorno text;
begin
  v_funcao := to_regprocedure(
    'public.criar_pedido_checkout(uuid,text,text,jsonb,text,uuid)'
  );

  if v_funcao is null then
    raise exception 'RPC criar_pedido_checkout atual não encontrada';
  end if;

  select pg_get_function_result(v_funcao::oid)
  into v_retorno;

  if v_retorno <> 'jsonb' then
    raise exception
      'Retorno inesperado da RPC criar_pedido_checkout: %',
      v_retorno;
  end if;
end
$$;

create or replace function public.criar_pedido_checkout(
  p_user_id uuid,
  p_email_cliente text,
  p_cliente text,
  p_itens jsonb,
  p_cupom text,
  p_idempotency_key uuid,
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

  if not found then
    raise exception 'Pedido criado não encontrado'
      using errcode = 'P0001';
  end if;

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

  if v_base_frete_gratis >= 400 then
    v_valor_frete := 0;
    v_regiao_frete := 'Brasil';
  elsif v_estado in ('SP', 'RJ', 'MG', 'ES') then
    v_valor_frete := 19.90;
    v_regiao_frete := 'Sudeste';
  elsif v_estado in ('PR', 'SC', 'RS') then
    v_valor_frete := 19.90;
    v_regiao_frete := 'Sul';
  else
    raise exception 'Consulte o frete para o estado %', v_estado
      using errcode = 'P0001';
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

revoke all privileges
on function public.criar_pedido_checkout(
  uuid,
  text,
  text,
  jsonb,
  text,
  uuid,
  jsonb
)
from public, anon, authenticated, service_role;

grant execute
on function public.criar_pedido_checkout(
  uuid,
  text,
  text,
  jsonb,
  text,
  uuid,
  jsonb
)
to service_role;

commit;
