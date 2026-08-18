-- =====================================================
-- MIGRATION: REMOVER CONSTRAINT LEGADA E ADICIONAR UNICIDADE POR VARIAÇÃO
-- =====================================================

begin;

-- 1. Garantir que todas as linhas antigas de produto_tamanhos sem variacao_id estejam vinculadas a uma variação
insert into public.produto_variacoes (produto_id, cor_nome, cor_hex, fotos, ordem, ativo)
select
  p.id,
  coalesce(nullif(trim(p.cor), ''), 'Única') as cor_nome,
  '#234B36' as cor_hex,
  '[]'::jsonb as fotos,
  0 as ordem,
  true as ativo
from public.produtos p
where exists (
  select 1 from public.produto_tamanhos pt where pt.produto_id = p.id and pt.variacao_id is null
)
and not exists (
  select 1 from public.produto_variacoes pv where pv.produto_id = p.id
);

update public.produto_tamanhos pt
set
  variacao_id = pv.id,
  cor = coalesce(pt.cor, pv.cor_nome),
  cor_hex = coalesce(pt.cor_hex, pv.cor_hex)
from public.produto_variacoes pv
where pt.produto_id = pv.produto_id
  and pt.variacao_id is null;

-- 2. Remover a constraint legada que impedia múltiplas cores para o mesmo produto e tamanho
alter table public.produto_tamanhos
  drop constraint if exists produto_tamanhos_produto_id_tamanho_key;

drop index if exists public.produto_tamanhos_produto_id_tamanho_key;
drop index if exists public.produto_tamanhos_produto_id_tamanho_idx;

-- 3. Criar a nova regra de unicidade compatível com múltiplas cores (produto_id + variacao_id + tamanho)
alter table public.produto_tamanhos
  add constraint produto_tamanhos_produto_variacao_tamanho_key
  unique (produto_id, variacao_id, tamanho);

commit;
