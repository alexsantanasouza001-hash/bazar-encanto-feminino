-- ====================================================================
-- MIGRATION: CORREÇÃO DE RLS E PERMISSÕES EM PRODUTOS, VARIAÇÕES, TAMANHOS E FOTOS
-- BAZAR ENCANTO FEMININO
-- ====================================================================

begin;

-- 1. HABILITAR RLS EM TODAS AS TABELAS DO CATÁLOGO
alter table public.produtos enable row level security;
alter table public.produto_variacoes enable row level security;
alter table public.produto_tamanhos enable row level security;
alter table public.produto_fotos enable row level security;

-- 2. REMOVER TODAS AS POLICIES ANTERIORES PERMISSIVAS OU INSEGURAS
drop policy if exists produtos_all on public.produtos;
drop policy if exists produtos_public_select on public.produtos;
drop policy if exists produtos_admin_insert on public.produtos;
drop policy if exists produtos_admin_update on public.produtos;
drop policy if exists produtos_admin_delete on public.produtos;

drop policy if exists produto_variacoes_all on public.produto_variacoes;
drop policy if exists produto_variacoes_public_select on public.produto_variacoes;
drop policy if exists produto_variacoes_admin_all on public.produto_variacoes;

drop policy if exists produto_tamanhos_all on public.produto_tamanhos;
drop policy if exists produto_tamanhos_public_select on public.produto_tamanhos;
drop policy if exists produto_tamanhos_admin_insert on public.produto_tamanhos;
drop policy if exists produto_tamanhos_admin_update on public.produto_tamanhos;
drop policy if exists produto_tamanhos_admin_delete on public.produto_tamanhos;

drop policy if exists produto_fotos_all on public.produto_fotos;
drop policy if exists produto_fotos_public_select on public.produto_fotos;
drop policy if exists produto_fotos_admin_all on public.produto_fotos;

-- 3. POLICIES ESTRITAS — TABELA: PRODUTOS
-- Loja pública e clientes autenticados: Leitura permitida
create policy produtos_public_select
on public.produtos
for select
to anon, authenticated
using (true);

-- Administradores/Sócios: CRUD total
create policy produtos_admin_insert
on public.produtos
for insert
to authenticated
with check (public.e_admin_ou_socio());

create policy produtos_admin_update
on public.produtos
for update
to authenticated
using (public.e_admin_ou_socio())
with check (public.e_admin_ou_socio());

create policy produtos_admin_delete
on public.produtos
for delete
to authenticated
using (public.e_admin_ou_socio());

-- 4. POLICIES ESTRITAS — TABELA: PRODUTO_VARIACOES
create policy produto_variacoes_public_select
on public.produto_variacoes
for select
to anon, authenticated
using (true);

create policy produto_variacoes_admin_insert
on public.produto_variacoes
for insert
to authenticated
with check (public.e_admin_ou_socio());

create policy produto_variacoes_admin_update
on public.produto_variacoes
for update
to authenticated
using (public.e_admin_ou_socio())
with check (public.e_admin_ou_socio());

create policy produto_variacoes_admin_delete
on public.produto_variacoes
for delete
to authenticated
using (public.e_admin_ou_socio());

-- 5. POLICIES ESTRITAS — TABELA: PRODUTO_TAMANHOS
create policy produto_tamanhos_public_select
on public.produto_tamanhos
for select
to anon, authenticated
using (true);

create policy produto_tamanhos_admin_insert
on public.produto_tamanhos
for insert
to authenticated
with check (public.e_admin_ou_socio());

create policy produto_tamanhos_admin_update
on public.produto_tamanhos
for update
to authenticated
using (public.e_admin_ou_socio())
with check (public.e_admin_ou_socio());

create policy produto_tamanhos_admin_delete
on public.produto_tamanhos
for delete
to authenticated
using (public.e_admin_ou_socio());

-- 6. POLICIES ESTRITAS — TABELA: PRODUTO_FOTOS
create policy produto_fotos_public_select
on public.produto_fotos
for select
to anon, authenticated
using (true);

create policy produto_fotos_admin_insert
on public.produto_fotos
for insert
to authenticated
with check (public.e_admin_ou_socio());

create policy produto_fotos_admin_update
on public.produto_fotos
for update
to authenticated
using (public.e_admin_ou_socio())
with check (public.e_admin_ou_socio());

create policy produto_fotos_admin_delete
on public.produto_fotos
for delete
to authenticated
using (public.e_admin_ou_socio());

-- 7. RESTRINGIR GRANTS DE TABELA E SEQUÊNCIAS
-- Revogar tudo de public, anon e authenticated
revoke all privileges on table public.produtos from public, anon, authenticated;
revoke all privileges on table public.produto_variacoes from public, anon, authenticated;
revoke all privileges on table public.produto_tamanhos from public, anon, authenticated;
revoke all privileges on table public.produto_fotos from public, anon, authenticated;

-- Conceder apenas SELECT para anon
grant select on table public.produtos to anon;
grant select on table public.produto_variacoes to anon;
grant select on table public.produto_tamanhos to anon;
grant select on table public.produto_fotos to anon;

-- Conceder permissões completas para authenticated (filtradas pelas policies RLS acima)
grant select, insert, update, delete on table public.produtos to authenticated;
grant select, insert, update, delete on table public.produto_variacoes to authenticated;
grant select, insert, update, delete on table public.produto_tamanhos to authenticated;
grant select, insert, update, delete on table public.produto_fotos to authenticated;

-- Service role tem acesso total
grant select, insert, update, delete on table public.produtos to service_role;
grant select, insert, update, delete on table public.produto_variacoes to service_role;
grant select, insert, update, delete on table public.produto_tamanhos to service_role;
grant select, insert, update, delete on table public.produto_fotos to service_role;

-- Sequences de ID acessíveis apenas por authenticated e service_role
revoke all privileges on sequence public.produto_variacoes_id_seq from public, anon;
revoke all privileges on sequence public.produto_tamanhos_id_seq from public, anon;
revoke all privileges on sequence public.produto_fotos_id_seq from public, anon;

grant usage, select on sequence public.produto_variacoes_id_seq to authenticated, service_role;
grant usage, select on sequence public.produto_tamanhos_id_seq to authenticated, service_role;
grant usage, select on sequence public.produto_fotos_id_seq to authenticated, service_role;

commit;
