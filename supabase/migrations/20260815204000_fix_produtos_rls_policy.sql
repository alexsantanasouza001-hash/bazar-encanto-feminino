-- =====================================================
-- MIGRATION: POLICIES PERMISSIVAS PARA TABELA PRODUTOS
-- =====================================================

begin;

grant all on public.produtos to anon, authenticated, service_role;

drop policy if exists produtos_all on public.produtos;
create policy produtos_all
on public.produtos
for all
to public
using (true)
with check (true);

commit;
