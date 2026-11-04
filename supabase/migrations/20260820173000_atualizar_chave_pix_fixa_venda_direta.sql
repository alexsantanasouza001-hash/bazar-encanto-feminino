-- ====================================================================
-- MIGRATION: ATUALIZAR CHAVE PIX FIXA PARA VENDA DIRETA
-- BAZAR ENCANTO FEMININO
-- ====================================================================

begin;

insert into public.configuracoes_loja (chave, valor, descricao, atualizado_em)
values (
  'pix_chave_fixa',
  'bazarencanto610@gmail.com',
  'Chave Pix Oficial da Empresa para Venda Direta',
  now()
)
on conflict (chave) do update
  set valor = excluded.valor,
      descricao = excluded.descricao,
      atualizado_em = now();

commit;
