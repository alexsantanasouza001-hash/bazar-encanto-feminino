begin;

-- 1. Garantir que a constraint da tabela checkout_rate_limits inclua os escopos de rastreamento
alter table public.checkout_rate_limits
  drop constraint if exists checkout_rate_limits_escopo_check;

alter table public.checkout_rate_limits
  add constraint checkout_rate_limits_escopo_check
  check (
    escopo in (
      'checkout_ip_5m',
      'checkout_ip_1h',
      'checkout_email_30m',
      'checkout_user_30m',
      'pix_ip_30m',
      'pix_email_45m',
      'tracking_ip_5m',
      'tracking_ip_1h',
      'tracking_lookup_15m'
    )
  );

-- 2. Atualizar a RPC consumir_rate_limit_checkout para suportar os escopos de rastreamento
create or replace function public.consumir_rate_limit_checkout(
  p_escopo text,
  p_identidade_hash text,
  p_evento_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_agora timestamptz := clock_timestamp();
  v_limite integer;
  v_janela_segundos integer;
  v_quantidade integer;
  v_primeira_expiracao timestamptz;
  v_retry_after integer;
begin
  case p_escopo
    when 'checkout_ip_5m' then
      v_limite := 10;
      v_janela_segundos := 300;
    when 'checkout_ip_1h' then
      v_limite := 40;
      v_janela_segundos := 3600;
    when 'checkout_email_30m' then
      v_limite := 6;
      v_janela_segundos := 1800;
    when 'checkout_user_30m' then
      v_limite := 8;
      v_janela_segundos := 1800;
    when 'pix_ip_30m' then
      v_limite := 8;
      v_janela_segundos := 1800;
    when 'pix_email_45m' then
      v_limite := 2;
      v_janela_segundos := 2700;
    when 'tracking_ip_5m' then
      v_limite := 10;
      v_janela_segundos := 300;
    when 'tracking_ip_1h' then
      v_limite := 30;
      v_janela_segundos := 3600;
    when 'tracking_lookup_15m' then
      v_limite := 10;
      v_janela_segundos := 900;
    else
      raise exception 'Escopo de rate limit invalido'
        using errcode = '22023';
  end case;

  if p_identidade_hash is null
    or p_identidade_hash !~ '^[0-9a-f]{64}$'
    or p_evento_hash is null
    or p_evento_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Identificador de rate limit invalido'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_escopo || ':' || p_identidade_hash,
      0
    )
  );

  delete from public.checkout_rate_limits
  where escopo = p_escopo
    and identidade_hash = p_identidade_hash
    and expira_em <= v_agora;

  if exists (
    select 1
    from public.checkout_rate_limits
    where escopo = p_escopo
      and identidade_hash = p_identidade_hash
      and evento_hash = p_evento_hash
      and expira_em > v_agora
  ) then
    return jsonb_build_object(
      'permitido', true,
      'retry_after', 0
    );
  end if;

  select count(*), min(expira_em)
  into v_quantidade, v_primeira_expiracao
  from public.checkout_rate_limits
  where escopo = p_escopo
    and identidade_hash = p_identidade_hash
    and expira_em > v_agora;

  if v_quantidade >= v_limite then
    v_retry_after := greatest(
      1,
      ceil(
        extract(epoch from (v_primeira_expiracao - v_agora))
      )::integer
    );

    return jsonb_build_object(
      'permitido', false,
      'retry_after', v_retry_after
    );
  end if;

  insert into public.checkout_rate_limits (
    escopo,
    identidade_hash,
    evento_hash,
    criado_em,
    expira_em
  )
  values (
    p_escopo,
    p_identidade_hash,
    p_evento_hash,
    v_agora,
    v_agora + pg_catalog.make_interval(secs => v_janela_segundos)
  );

  return jsonb_build_object(
    'permitido', true,
    'retry_after', 0
  );
end;
$function$;

-- 3. Garantir a função consultar_pedido_publico
create or replace function public.consultar_pedido_publico(
  p_numero text,
  p_email text
)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'numero', p.numero,
    'data', p.data,
    'status', p.status,
    'status_pagamento', p.status_pagamento,
    'forma_pagamento', p.forma_pagamento,
    'subtotal', p.subtotal,
    'desconto', p.desconto,
    'valor_frete', p.valor_frete,
    'total', p.total,
    'cidade_entrega', p.cidade_entrega,
    'estado_entrega', p.estado_entrega,
    'transportadora', p.transportadora,
    'codigo_rastreio', p.codigo_rastreio,
    'url_rastreio', p.url_rastreio,
    'enviado_em', p.enviado_em,
    'entregue_em', p.entregue_em,
    'atualizado_em', p.atualizado_em,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', i.nome,
        'tamanho', i.tamanho,
        'quantidade', i.quantidade,
        'preco', i.preco,
        'subtotal', i.subtotal
      ) order by i.id)
      from public.pedido_itens i
      where i.pedido_id = p.id
    ), '[]'::jsonb)
  )
  from public.pedidos p
  where upper(btrim(p.numero)) = upper(btrim(p_numero))
    and lower(btrim(coalesce(p.email_cliente, ''))) = lower(btrim(p_email))
  limit 1;
$function$;

revoke all privileges on function public.consultar_pedido_publico(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.consultar_pedido_publico(text, text)
  to service_role;

-- 4. Limpeza pontual de rate limit de tracking para liberar testes
delete from public.checkout_rate_limits
where escopo in ('tracking_ip_5m', 'tracking_ip_1h', 'tracking_lookup_15m');

commit;
