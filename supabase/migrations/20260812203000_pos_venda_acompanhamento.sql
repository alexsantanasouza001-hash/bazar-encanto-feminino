begin;

alter table public.pedidos
  add column if not exists transportadora text,
  add column if not exists codigo_rastreio text,
  add column if not exists url_rastreio text,
  add column if not exists enviado_em timestamptz,
  add column if not exists entregue_em timestamptz,
  add column if not exists atualizado_em timestamptz not null default now(),
  add column if not exists observacao_envio text;

alter table public.pedidos
  drop constraint if exists pedidos_status_fluxo_check;

alter table public.pedidos
  add constraint pedidos_status_fluxo_check
  check (
    status in (
      'Aguardando pagamento',
      'Confirmado',
      'Em preparação',
      'Enviado',
      'Entregue',
      'Concluído',
      'Cancelado'
    )
  ) not valid;

alter table public.pedidos
  add constraint pedidos_transportadora_tamanho_check
  check (transportadora is null or length(transportadora) <= 120) not valid,
  add constraint pedidos_codigo_rastreio_tamanho_check
  check (codigo_rastreio is null or length(codigo_rastreio) <= 120) not valid,
  add constraint pedidos_url_rastreio_check
  check (
    url_rastreio is null
    or (
      length(url_rastreio) <= 500
      and url_rastreio ~ '^https://'
    )
  ) not valid,
  add constraint pedidos_observacao_envio_tamanho_check
  check (observacao_envio is null or length(observacao_envio) <= 500) not valid;

create index if not exists pedidos_status_atualizado_idx
  on public.pedidos (status, atualizado_em desc);

create or replace function public.atualizar_pedido_pos_venda(
  p_pedido_id bigint,
  p_novo_status text,
  p_transportadora text default null,
  p_codigo_rastreio text default null,
  p_url_rastreio text default null,
  p_observacao_envio text default null
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
  v_transicao_valida boolean := false;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role', '') <> 'admin' then
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
    or length(coalesce(v_observacao, '')) > 500 then
    raise exception 'Dados de envio excedem o limite permitido'
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
    or (v_status_atual = 'Enviado' and v_novo_status = 'Entregue')
    or (v_status_atual = 'Entregue' and v_novo_status = 'Concluído');

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
      transportadora = case
        when v_novo_status = 'Enviado' then v_transportadora
        else transportadora
      end,
      codigo_rastreio = case
        when v_novo_status = 'Enviado' then v_codigo_rastreio
        else codigo_rastreio
      end,
      url_rastreio = case
        when v_novo_status = 'Enviado' then v_url_rastreio
        else url_rastreio
      end,
      observacao_envio = case
        when v_novo_status = 'Enviado' then v_observacao
        else observacao_envio
      end,
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
  bigint, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.atualizar_pedido_pos_venda(
  bigint, text, text, text, text, text
) to authenticated;

-- Atualizações do pedido passam exclusivamente pela RPC acima, que aplica
-- as transições e valida a role administrativa no app_metadata.
revoke update on table public.pedidos from authenticated;

alter table public.checkout_rate_limits
  drop constraint checkout_rate_limits_escopo_check;

alter table public.checkout_rate_limits
  add constraint checkout_rate_limits_escopo_check
  check (
    escopo in (
      'checkout_ip_5m', 'checkout_ip_1h', 'checkout_email_30m',
      'checkout_user_30m', 'pix_ip_30m', 'pix_email_45m',
      'tracking_ip_5m', 'tracking_ip_1h', 'tracking_lookup_15m'
    )
  );

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
    when 'checkout_ip_5m' then v_limite := 10; v_janela_segundos := 300;
    when 'checkout_ip_1h' then v_limite := 40; v_janela_segundos := 3600;
    when 'checkout_email_30m' then v_limite := 6; v_janela_segundos := 1800;
    when 'checkout_user_30m' then v_limite := 8; v_janela_segundos := 1800;
    when 'pix_ip_30m' then v_limite := 8; v_janela_segundos := 1800;
    when 'pix_email_45m' then v_limite := 2; v_janela_segundos := 2700;
    when 'tracking_ip_5m' then v_limite := 10; v_janela_segundos := 300;
    when 'tracking_ip_1h' then v_limite := 30; v_janela_segundos := 3600;
    when 'tracking_lookup_15m' then v_limite := 5; v_janela_segundos := 900;
    else raise exception 'Escopo de rate limit invalido' using errcode = '22023';
  end case;

  if p_identidade_hash is null or p_identidade_hash !~ '^[0-9a-f]{64}$'
    or p_evento_hash is null or p_evento_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Identificador de rate limit invalido' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_escopo || ':' || p_identidade_hash, 0)
  );

  delete from public.checkout_rate_limits
  where escopo = p_escopo
    and identidade_hash = p_identidade_hash
    and expira_em <= v_agora;

  if exists (
    select 1 from public.checkout_rate_limits
    where escopo = p_escopo
      and identidade_hash = p_identidade_hash
      and evento_hash = p_evento_hash
      and expira_em > v_agora
  ) then
    return jsonb_build_object('permitido', true, 'retry_after', 0);
  end if;

  select count(*), min(expira_em)
  into v_quantidade, v_primeira_expiracao
  from public.checkout_rate_limits
  where escopo = p_escopo
    and identidade_hash = p_identidade_hash
    and expira_em > v_agora;

  if v_quantidade >= v_limite then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_primeira_expiracao - v_agora)))::integer);
    return jsonb_build_object('permitido', false, 'retry_after', v_retry_after);
  end if;

  insert into public.checkout_rate_limits (
    escopo, identidade_hash, evento_hash, criado_em, expira_em
  ) values (
    p_escopo, p_identidade_hash, p_evento_hash, v_agora,
    v_agora + pg_catalog.make_interval(secs => v_janela_segundos)
  );

  return jsonb_build_object('permitido', true, 'retry_after', 0);
end;
$function$;

revoke all privileges on function public.consumir_rate_limit_checkout(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.consumir_rate_limit_checkout(text, text, text)
  to service_role;

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

alter table public.produtos
  add column if not exists ativo boolean not null default true;

drop policy if exists produtos_public_select on public.produtos;
create policy produtos_public_select
on public.produtos
for select
to anon, authenticated
using (
  ativo = true
  or coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin'
);

create or replace function public.impedir_item_produto_inativo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not exists (
    select 1 from public.produtos
    where id = new.produto_id
      and ativo = true
  ) then
    raise exception 'Produto % indisponível para compra', new.produto_id
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

drop trigger if exists pedido_itens_produto_ativo_trigger on public.pedido_itens;
create trigger pedido_itens_produto_ativo_trigger
before insert on public.pedido_itens
for each row execute function public.impedir_item_produto_inativo();

revoke all privileges on function public.impedir_item_produto_inativo()
  from public, anon, authenticated, service_role;

commit;
