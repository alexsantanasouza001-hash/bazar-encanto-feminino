-- ====================================================================
-- MIGRATION: ADICIONAR CONCEITO DE RODADA DE APORTE EM FINANCEIRO_APORTES
-- BAZAR ENCANTO FEMININO
-- ====================================================================

begin;

alter table public.financeiro_aportes
  add column if not exists rodada_numero integer not null default 1,
  add column if not exists rodada_nome text not null default 'Aporte 1';

create index if not exists idx_financeiro_aportes_rodada_num on public.financeiro_aportes(rodada_numero);
create index if not exists idx_financeiro_aportes_rodada_nome on public.financeiro_aportes(rodada_nome);

commit;
