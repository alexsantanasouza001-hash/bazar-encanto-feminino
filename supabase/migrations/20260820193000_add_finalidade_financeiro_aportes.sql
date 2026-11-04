-- ====================================================================
-- MIGRATION: ADICIONAR CAMPO FINALIDADE NA TABELA FINANCEIRO_APORTES
-- BAZAR ENCANTO FEMININO
-- ====================================================================

begin;

alter table public.financeiro_aportes
  add column if not exists finalidade text not null default 'Capital de giro';

create index if not exists idx_financeiro_aportes_finalidade on public.financeiro_aportes(finalidade);

commit;
