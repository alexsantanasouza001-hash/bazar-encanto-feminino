-- =====================================================
-- MIGRATION: AJUSTE FKs, PERMISSÕES E LIMPEZA DE VARIAÇÕES
-- =====================================================

begin;

-- 1. AJUSTAR FOREIGN KEYS PARA ON DELETE SET NULL / CASCADE
alter table public.reservas_estoque
  drop constraint if exists reservas_estoque_produto_tamanho_id_fkey,
  add constraint reservas_estoque_produto_tamanho_id_fkey
    foreign key (produto_tamanho_id)
    references public.produto_tamanhos(id)
    on delete set null;

alter table public.revenda_remessa_itens
  drop constraint if exists revenda_remessa_itens_produto_tamanho_id_fkey,
  add constraint revenda_remessa_itens_produto_tamanho_id_fkey
    foreign key (produto_tamanho_id)
    references public.produto_tamanhos(id)
    on delete set null;

alter table public.revenda_vendas
  drop constraint if exists revenda_vendas_produto_tamanho_id_fkey,
  add constraint revenda_vendas_produto_tamanho_id_fkey
    foreign key (produto_tamanho_id)
    references public.produto_tamanhos(id)
    on delete set null;

alter table public.revenda_devolucoes
  drop constraint if exists revenda_devolucoes_produto_tamanho_id_fkey,
  add constraint revenda_devolucoes_produto_tamanho_id_fkey
    foreign key (produto_tamanho_id)
    references public.produto_tamanhos(id)
    on delete set null;

-- 2. GARANTIR PERMISSÕES NAS TABELAS DE PRODUTOS E VARIAÇÕES
grant all on public.produtos to anon, authenticated, service_role;
grant all on public.produto_variacoes to anon, authenticated, service_role;
grant all on public.produto_tamanhos to anon, authenticated, service_role;
grant all on public.produto_fotos to anon, authenticated, service_role;

grant usage, select on sequence public.produto_variacoes_id_seq to anon, authenticated, service_role;
grant usage, select on sequence public.produto_tamanhos_id_seq to anon, authenticated, service_role;
grant usage, select on sequence public.produto_fotos_id_seq to anon, authenticated, service_role;

-- 3. POLICIES PERMISSIVAS PARA OPERAÇÃO DO ADMIN
drop policy if exists produto_variacoes_all on public.produto_variacoes;
create policy produto_variacoes_all
on public.produto_variacoes
for all
to public
using (true)
with check (true);

drop policy if exists produto_tamanhos_all on public.produto_tamanhos;
create policy produto_tamanhos_all
on public.produto_tamanhos
for all
to public
using (true)
with check (true);

drop policy if exists produto_fotos_all on public.produto_fotos;
create policy produto_fotos_all
on public.produto_fotos
for all
to public
using (true)
with check (true);

-- 4. LIMPEZA E SINCRONIZAÇÃO DO PRODUTO 1786823637573
-- Remover referências em reservas_estoque para os tamanhos que serão limpos
update public.reservas_estoque
set produto_tamanho_id = null
where produto_id = 1786823637573 and variacao_id in (33, 34, 35, 36, 37);

-- Remover as variações duplicadas (33, 34, 35, 36, 37) mantendo apenas a última com 1 unidade (38)
delete from public.produto_tamanhos where produto_id = 1786823637573 and variacao_id in (33, 34, 35, 36, 37);
delete from public.produto_variacoes where produto_id = 1786823637573 and id in (33, 34, 35, 36, 37);

-- Atualizar a quantidade em produtos para refletir a soma real dos tamanhos ativos
update public.produtos p
set quantidade = coalesce((
  select sum(pt.quantidade)
  from public.produto_tamanhos pt
  inner join public.produto_variacoes pv on pv.id = pt.variacao_id
  where pt.produto_id = p.id and pv.ativo = true
), 0)
where p.id = 1786823637573;

commit;
