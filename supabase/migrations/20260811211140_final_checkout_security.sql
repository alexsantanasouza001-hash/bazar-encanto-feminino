begin;

-- ============================================================
-- IDEMPOTÊNCIA DOS NOVOS PEDIDOS
-- ============================================================

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_index as indice
    where indice.indrelid = 'public.pedidos'::regclass
      and indice.indisunique
      and (
        select array_agg(atributo.attname::text order by chave.ordinality)
        from unnest(indice.indkey) with ordinality
          as chave(attnum, ordinality)
        join pg_catalog.pg_attribute as atributo
          on atributo.attrelid = indice.indrelid
         and atributo.attnum = chave.attnum
        where chave.ordinality <= indice.indnkeyatts
      ) = array['idempotency_key']::text[]
  ) then
    create unique index pedidos_idempotency_key_unique_idx
      on public.pedidos (idempotency_key)
      where idempotency_key is not null;
  end if;
end;
$migration$;

create or replace function public.exigir_idempotency_key_novo_pedido()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.idempotency_key is null then
    raise exception
      'idempotency_key é obrigatória para novos pedidos'
      using errcode = '23502';
  end if;

  return new;
end;
$function$;

revoke all privileges
  on function public.exigir_idempotency_key_novo_pedido()
  from public, anon, authenticated, service_role;

drop trigger if exists pedidos_exigir_idempotency_key
  on public.pedidos;

create trigger pedidos_exigir_idempotency_key
before insert on public.pedidos
for each row
execute function public.exigir_idempotency_key_novo_pedido();

-- ============================================================
-- CHECK CONSTRAINTS
-- Cria somente as proteções sem equivalente e valida todas as
-- CHECK constraints pendentes destas tabelas.
-- ============================================================

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.produtos'::regclass
      and contype = 'c'
      and regexp_replace(
        pg_catalog.pg_get_expr(conbin, conrelid),
        '[[:space:]()]',
        '',
        'g'
      ) ~ '(^|[^[:alnum:]_])quantidade>=0'
  ) then
    alter table public.produtos
      add constraint produtos_quantidade_nao_negativa_check
      check (quantidade >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.produto_tamanhos'::regclass
      and contype = 'c'
      and regexp_replace(
        pg_catalog.pg_get_expr(conbin, conrelid),
        '[[:space:]()]',
        '',
        'g'
      ) ~ '(^|[^[:alnum:]_])quantidade>=0'
  ) then
    alter table public.produto_tamanhos
      add constraint produto_tamanhos_quantidade_nao_negativa_check
      check (quantidade >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.pedido_itens'::regclass
      and contype = 'c'
      and regexp_replace(
        pg_catalog.pg_get_expr(conbin, conrelid),
        '[[:space:]()]',
        '',
        'g'
      ) ~ '(^|[^[:alnum:]_])quantidade>0'
  ) then
    alter table public.pedido_itens
      add constraint pedido_itens_quantidade_positiva_check
      check (quantidade > 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.pedido_itens'::regclass
      and contype = 'c'
      and regexp_replace(
        pg_catalog.pg_get_expr(conbin, conrelid),
        '[[:space:]()]',
        '',
        'g'
      ) ~ '(^|[^[:alnum:]_])preco>=0'
  ) then
    alter table public.pedido_itens
      add constraint pedido_itens_preco_nao_negativo_check
      check (preco >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.pedido_itens'::regclass
      and contype = 'c'
      and regexp_replace(
        pg_catalog.pg_get_expr(conbin, conrelid),
        '[[:space:]()]',
        '',
        'g'
      ) ~ '(^|[^[:alnum:]_])subtotal>=0'
  ) then
    alter table public.pedido_itens
      add constraint pedido_itens_subtotal_nao_negativo_check
      check (subtotal >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.pedidos'::regclass
      and contype = 'c'
      and regexp_replace(
        pg_catalog.pg_get_expr(conbin, conrelid),
        '[[:space:]()]',
        '',
        'g'
      ) ~ '(^|[^[:alnum:]_])subtotal>=0'
  ) then
    alter table public.pedidos
      add constraint pedidos_subtotal_nao_negativo_check
      check (subtotal >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.pedidos'::regclass
      and contype = 'c'
      and regexp_replace(
        pg_catalog.pg_get_expr(conbin, conrelid),
        '[[:space:]()]',
        '',
        'g'
      ) ~ '(^|[^[:alnum:]_])desconto>=0'
  ) then
    alter table public.pedidos
      add constraint pedidos_desconto_nao_negativo_check
      check (desconto >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.pedidos'::regclass
      and contype = 'c'
      and regexp_replace(
        pg_catalog.pg_get_expr(conbin, conrelid),
        '[[:space:]()]',
        '',
        'g'
      ) ~ '(^|[^[:alnum:]_])desconto<=subtotal'
  ) then
    alter table public.pedidos
      add constraint pedidos_desconto_limitado_ao_subtotal_check
      check (desconto <= subtotal) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.pedidos'::regclass
      and contype = 'c'
      and regexp_replace(
        pg_catalog.pg_get_expr(conbin, conrelid),
        '[[:space:]()]',
        '',
        'g'
      ) ~ '(^|[^[:alnum:]_])total>=0'
  ) then
    alter table public.pedidos
      add constraint pedidos_total_nao_negativo_check
      check (total >= 0) not valid;
  end if;
end;
$migration$;

do $migration$
declare
  restricao record;
begin
  for restricao in
    select
      namespace.nspname as schema_nome,
      tabela.relname as tabela_nome,
      constraint_atual.conname as constraint_nome
    from pg_catalog.pg_constraint as constraint_atual
    join pg_catalog.pg_class as tabela
      on tabela.oid = constraint_atual.conrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = tabela.relnamespace
    where namespace.nspname = 'public'
      and tabela.relname in (
        'pedidos',
        'pedido_itens',
        'produtos',
        'produto_tamanhos'
      )
      and constraint_atual.contype = 'c'
      and not constraint_atual.convalidated
  loop
    execute format(
      'alter table %I.%I validate constraint %I',
      restricao.schema_nome,
      restricao.tabela_nome,
      restricao.constraint_nome
    );
  end loop;
end;
$migration$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.pedidos enable row level security;
alter table public.pedido_itens enable row level security;
alter table public.produtos enable row level security;
alter table public.produto_tamanhos enable row level security;
alter table public.movimentacoes enable row level security;

-- Policies públicas antigas de produto_tamanhos.
drop policy if exists produto_tamanhos_select
  on public.produto_tamanhos;
drop policy if exists produto_tamanhos_insert
  on public.produto_tamanhos;
drop policy if exists produto_tamanhos_update
  on public.produto_tamanhos;
drop policy if exists produto_tamanhos_delete
  on public.produto_tamanhos;

-- Permite reaplicar a migration em ambiente de revisão.
drop policy if exists pedidos_cliente_select
  on public.pedidos;
drop policy if exists pedidos_admin_select
  on public.pedidos;
drop policy if exists pedidos_admin_update
  on public.pedidos;
drop policy if exists pedidos_admin_delete
  on public.pedidos;
drop policy if exists pedido_itens_cliente_select
  on public.pedido_itens;
drop policy if exists pedido_itens_admin_select
  on public.pedido_itens;
drop policy if exists produtos_public_select
  on public.produtos;
drop policy if exists produtos_admin_insert
  on public.produtos;
drop policy if exists produtos_admin_update
  on public.produtos;
drop policy if exists produtos_admin_delete
  on public.produtos;
drop policy if exists produto_tamanhos_public_select
  on public.produto_tamanhos;
drop policy if exists produto_tamanhos_admin_insert
  on public.produto_tamanhos;
drop policy if exists produto_tamanhos_admin_update
  on public.produto_tamanhos;
drop policy if exists produto_tamanhos_admin_delete
  on public.produto_tamanhos;
drop policy if exists movimentacoes_admin_select
  on public.movimentacoes;
drop policy if exists movimentacoes_admin_insert
  on public.movimentacoes;
drop policy if exists movimentacoes_admin_update
  on public.movimentacoes;

-- PEDIDOS

create policy pedidos_cliente_select
on public.pedidos
for select
to authenticated
using (user_id = auth.uid());

create policy pedidos_admin_select
on public.pedidos
for select
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

create policy pedidos_admin_update
on public.pedidos
for update
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
)
with check (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

create policy pedidos_admin_delete
on public.pedidos
for delete
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

-- PEDIDO_ITENS

create policy pedido_itens_cliente_select
on public.pedido_itens
for select
to authenticated
using (
  exists (
    select 1
    from public.pedidos
    where pedidos.id = pedido_itens.pedido_id
      and pedidos.user_id = auth.uid()
  )
);

create policy pedido_itens_admin_select
on public.pedido_itens
for select
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

-- PRODUTOS

create policy produtos_public_select
on public.produtos
for select
to anon, authenticated
using (true);

create policy produtos_admin_insert
on public.produtos
for insert
to authenticated
with check (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

create policy produtos_admin_update
on public.produtos
for update
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
)
with check (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

create policy produtos_admin_delete
on public.produtos
for delete
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

-- PRODUTO_TAMANHOS

create policy produto_tamanhos_public_select
on public.produto_tamanhos
for select
to anon, authenticated
using (true);

create policy produto_tamanhos_admin_insert
on public.produto_tamanhos
for insert
to authenticated
with check (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

create policy produto_tamanhos_admin_update
on public.produto_tamanhos
for update
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
)
with check (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

create policy produto_tamanhos_admin_delete
on public.produto_tamanhos
for delete
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

-- MOVIMENTACOES

create policy movimentacoes_admin_select
on public.movimentacoes
for select
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

create policy movimentacoes_admin_insert
on public.movimentacoes
for insert
to authenticated
with check (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

create policy movimentacoes_admin_update
on public.movimentacoes
for update
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
)
with check (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

-- ============================================================
-- GRANTS MÍNIMOS
-- ============================================================

revoke all privileges
on table
  public.pedidos,
  public.pedido_itens,
  public.produtos,
  public.produto_tamanhos,
  public.movimentacoes
from public, anon, authenticated, service_role;

-- Loja pública e clientes autenticadas: catálogo somente leitura.
grant select
on table public.produtos, public.produto_tamanhos
to anon, authenticated;

-- Clientes autenticadas leem somente o que as policies liberarem.
grant select
on table public.pedidos, public.pedido_itens
to authenticated;

-- Operações administrativas usadas pelo painel.
grant update (status)
on table public.pedidos
to authenticated;

grant delete
on table public.pedidos
to authenticated;

grant insert, update, delete
on table public.produtos, public.produto_tamanhos
to authenticated;

grant select, insert, update
on table public.movimentacoes
to authenticated;

-- Operações estritamente necessárias à RPC chamada pela Edge Function.
grant select, insert
on table public.pedidos, public.pedido_itens
to service_role;

grant select, update
on table public.produtos, public.produto_tamanhos
to service_role;

grant select, insert
on table public.movimentacoes
to service_role;

-- A RPC transacional não pode ser chamada pelo navegador.
revoke all privileges
on function public.criar_pedido_checkout(
  uuid,
  text,
  text,
  jsonb,
  text,
  uuid
)
from public, anon, authenticated, service_role;

grant execute
on function public.criar_pedido_checkout(
  uuid,
  text,
  text,
  jsonb,
  text,
  uuid
)
to service_role;

commit;
