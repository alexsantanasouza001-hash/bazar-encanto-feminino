-- =====================================================
-- MIGRATION: REMOVER DINAMICAMENTE QUALQUER CONSTRAINT/ÍNDICE UNIQUE LEGADO EM PRODUTO_TAMANHOS
-- =====================================================

begin;

do $$
declare
  r record;
begin
  -- 1. Dropar todas as constraints UNIQUE em produto_tamanhos que não incluam variacao_id
  for r in (
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'produto_tamanhos'
      and c.contype = 'u'
      and not exists (
        select 1
        from unnest(c.conkey) as k
        join pg_attribute a on a.attrelid = t.oid and a.attnum = k
        where a.attname = 'variacao_id'
      )
  ) loop
    raise notice 'Removendo constraint unique legada: %', r.conname;
    execute format('alter table public.produto_tamanhos drop constraint if exists %I cascade;', r.conname);
  end loop;

  -- 2. Dropar todos os índices UNIQUE em produto_tamanhos que não incluam variacao_id (e não sejam primary key)
  for r in (
    select i.relname as index_name
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'produto_tamanhos'
      and x.indisunique = true
      and not x.indisprimary
      and not exists (
        select 1
        from unnest(x.indkey) as k
        join pg_attribute a on a.attrelid = t.oid and a.attnum = k
        where a.attname = 'variacao_id'
      )
  ) loop
    raise notice 'Removendo indice unique legado: %', r.index_name;
    execute format('drop index if exists public.%I cascade;', r.index_name);
  end loop;
end $$;

-- 3. Garantir a existência da constraint correta por produto_id + variacao_id + tamanho
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'produto_tamanhos'
      and c.contype = 'u'
      and c.conname = 'produto_tamanhos_produto_variacao_tamanho_key'
  ) then
    alter table public.produto_tamanhos
      add constraint produto_tamanhos_produto_variacao_tamanho_key
      unique (produto_id, variacao_id, tamanho);
  end if;
end $$;

commit;
