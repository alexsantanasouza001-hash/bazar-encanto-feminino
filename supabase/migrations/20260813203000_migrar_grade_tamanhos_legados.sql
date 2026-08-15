begin;

-- Migrar tamanhos legados dos produtos para a tabela oficial produto_tamanhos
insert into public.produto_tamanhos (produto_id, tamanho, quantidade)
select p.id, btrim(p.tamanho), coalesce(p.quantidade, 0)
from public.produtos p
where p.tamanho is not null
  and btrim(p.tamanho) <> ''
  and not exists (
    select 1
    from public.produto_tamanhos pt
    where pt.produto_id = p.id
  );

commit;
