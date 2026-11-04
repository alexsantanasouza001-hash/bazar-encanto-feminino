-- =============================================================================
-- Nova regra de comissão das revendedoras (04/11/2026)
--
-- ANTES: se o total da venda fosse <= ao valor de repasse (peça vendida a preço
--        de custo/repasse), a comissão era ZERO.
-- AGORA: a comissão é SEMPRE o percentual da revendedora sobre o total da venda
--        (após desconto), independentemente do repasse.
--
-- 1) Corrige as funções de venda que ainda aplicam a regra antiga.
--    Em vez de copiar os corpos inteiros (que podem ter divergido dos arquivos),
--    lê a definição ATUAL de cada função no banco e troca apenas a condição
--    "if <total> <= <repasse_total> then" por "if false then".
-- 2) Recalcula valor_comissao / valor_loja das vendas já lançadas com a regra antiga.
-- =============================================================================

do $$
declare
  r record;
  v_def text;
  v_novo text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* 'if\s+v_\w+\s*<=\s*v_\w*repasse_total\s+then'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_novo := regexp_replace(
      v_def,
      'if\s+(v_\w+)\s*<=\s*(v_\w*repasse_total)\s+then',
      'if false then -- regra antiga removida em 04/11/2026: comissão sempre sobre o total',
      'gi'
    );
    execute v_novo;
    raise notice 'Função % atualizada: comissão sempre aplicada.', r.proname;
  end loop;

  -- Garantia: nenhuma função pode continuar com a regra antiga.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* 'if\s+v_\w+\s*<=\s*v_\w*repasse_total\s+then'
  ) then
    raise exception 'Ainda existe função com a regra antiga de comissão zero.';
  end if;
end $$;

-- Recalcula as vendas confirmadas que ficaram com comissão zero pela regra antiga.
update public.revenda_vendas
set valor_comissao = round(coalesce(total_venda, valor_total_bruto, 0) * (comissao_percentual / 100.0), 2),
    valor_loja = round(
      coalesce(total_venda, valor_total_bruto, 0)
      - round(coalesce(total_venda, valor_total_bruto, 0) * (comissao_percentual / 100.0), 2),
      2
    )
where coalesce(valor_comissao, 0) = 0
  and coalesce(comissao_percentual, 0) > 0
  and coalesce(total_venda, valor_total_bruto, 0) > 0;
