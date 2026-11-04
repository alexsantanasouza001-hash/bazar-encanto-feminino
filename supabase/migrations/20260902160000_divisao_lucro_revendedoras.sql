-- ====================================================================
-- MIGRATION: DIVISÃO ESPECIAL DE LUCRO LÍQUIDO POR REVENDEDORA
-- ====================================================================

-- 1. Colunas aditivas na tabela revendedoras (sem regras automáticas para IDs específicos)
alter table public.revendedoras
  add column if not exists usa_divisao_lucro boolean not null default false,
  add column if not exists percentual_lucro_revendedora numeric(5,2) not null default 0.00;

-- 2. Restrição de validação de percentual (0 a 100)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'revendedoras_percentual_lucro_check'
  ) then
    alter table public.revendedoras
      add constraint revendedoras_percentual_lucro_check
      check (percentual_lucro_revendedora >= 0 and percentual_lucro_revendedora <= 100);
  end if;
end $$;
