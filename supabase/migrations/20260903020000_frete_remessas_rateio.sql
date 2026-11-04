-- ====================================================================
-- MIGRATION: FRETE DA REMESSA E RATEIO AUTOMÁTICO POR PEÇA ENVIADA
-- ====================================================================

begin;

-- 1. Colunas aditivas nas tabelas de remessas e itens
alter table public.revenda_remessas
  add column if not exists frete numeric(10,2) not null default 0.00 check (frete >= 0);

alter table public.revenda_remessa_itens
  add column if not exists valor_repasse_base numeric(10,2),
  add column if not exists frete_rateado_unitario numeric(10,2) not null default 0.00 check (frete_rateado_unitario >= 0);

-- 2. Backfill retrocompatível dos itens existentes
update public.revenda_remessa_itens
set valor_repasse_base = preco_venda_sugerido
where valor_repasse_base is null;

-- 3. Atualizar RPC criar_remessa_consignacao
create or replace function public.criar_remessa_consignacao(
  p_revendedora_id bigint,
  p_itens jsonb,
  p_observacao text default null,
  p_responsavel text default null,
  p_frete numeric default 0.00
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_revendedora public.revendedoras%rowtype;
  v_remessa_id bigint;
  v_numero_seq bigint;
  v_numero text;
  v_item jsonb;
  v_produto_id bigint;
  v_variacao_id bigint;
  v_tamanho_id bigint;
  v_tamanho text;
  v_cor text;
  v_cor_hex text;
  v_quantidade integer;
  v_repasse_base numeric(10,2);
  v_frete_rateado numeric(10,2) := 0.00;
  v_preco numeric(10,2);
  v_custo numeric(10,2);
  v_comissao numeric(5,2);
  v_produto_nome text;
  v_sku text;
  v_estoque_atual integer;
  v_tamanho_estoque integer;
  v_total_pecas integer := 0;
  v_total_valor numeric(12,2) := 0;
  v_frete numeric(10,2) := coalesce(p_frete, 0.00);
begin
  if not public.e_admin_ou_socio() then
    raise exception 'Acesso restrito a administradores e sócios' using errcode = '42501';
  end if;

  select * into v_revendedora from public.revendedoras where id = p_revendedora_id;
  if not found then
    raise exception 'Revendedora não encontrada' using errcode = 'P0002';
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'A remessa precisa conter ao menos um item' using errcode = '22023';
  end if;

  -- Calcular total de peças enviadas para o rateio do frete
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_total_pecas := v_total_pecas + coalesce((v_item->>'quantidade')::integer, 0);
  end loop;

  if v_total_pecas > 0 and v_frete > 0 then
    v_frete_rateado := round((v_frete / v_total_pecas)::numeric, 2);
  else
    v_frete_rateado := 0.00;
  end if;

  v_numero_seq := nextval('public.revenda_remessa_numero_seq');
  v_numero := 'REM-' || lpad(v_numero_seq::text, 6, '0');

  insert into public.revenda_remessas (
    numero,
    revendedora_id,
    data_envio,
    comissao_padrao_remessa,
    status,
    observacao,
    responsavel,
    total_pecas_enviadas,
    total_valor_enviado,
    frete
  ) values (
    v_numero,
    p_revendedora_id,
    now(),
    v_revendedora.comissao_padrao,
    'Enviada',
    p_observacao,
    p_responsavel,
    0,
    0,
    v_frete
  ) returning id into v_remessa_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_produto_id := (v_item->>'produto_id')::bigint;
    v_variacao_id := nullif(v_item->>'variacao_id', '')::bigint;
    v_tamanho_id := nullif(v_item->>'produto_tamanho_id', '')::bigint;
    v_tamanho := nullif(btrim(v_item->>'tamanho'), '');
    v_cor := nullif(btrim(v_item->>'cor'), '');
    v_cor_hex := nullif(btrim(v_item->>'cor_hex'), '');
    v_quantidade := coalesce((v_item->>'quantidade')::integer, 0);
    v_repasse_base := coalesce((v_item->>'valor_repasse_base')::numeric, (v_item->>'preco_venda_sugerido')::numeric, 0.00);
    v_preco := v_repasse_base + v_frete_rateado;
    v_comissao := coalesce((v_item->>'comissao_percentual')::numeric, v_revendedora.comissao_padrao);

    if v_quantidade <= 0 then
      raise exception 'Quantidade inválida para o produto %', v_produto_id using errcode = '22023';
    end if;

    select nome, sku, quantidade, custo into v_produto_nome, v_sku, v_estoque_atual, v_custo
    from public.produtos
    where id = v_produto_id
    for update;

    if not found then
      raise exception 'Produto % não encontrado', v_produto_id using errcode = 'P0002';
    end if;

    if v_estoque_atual < v_quantidade then
      raise exception 'Estoque insuficiente na loja para o produto % (Disponível: %, Solicitado: %)',
        v_produto_nome, v_estoque_atual, v_quantidade using errcode = 'P0001';
    end if;

    if v_tamanho_id is not null then
      select quantidade into v_tamanho_estoque
      from public.produto_tamanhos
      where id = v_tamanho_id and produto_id = v_produto_id
      for update;

      if not found then
        raise exception 'Tamanho ID % não encontrado para o produto %', v_tamanho_id, v_produto_nome using errcode = 'P0002';
      end if;

      if v_tamanho_estoque < v_quantidade then
        raise exception 'Estoque insuficiente na grade % do produto % (Disponível: %, Solicitado: %)',
          v_tamanho, v_produto_nome, v_tamanho_estoque, v_quantidade using errcode = 'P0001';
      end if;

      update public.produto_tamanhos
      set quantidade = quantidade - v_quantidade
      where id = v_tamanho_id;
    end if;

    update public.produtos
    set quantidade = quantidade - v_quantidade
    where id = v_produto_id;

    insert into public.revenda_remessa_itens (
      remessa_id,
      produto_id,
      variacao_id,
      produto_tamanho_id,
      produto_nome,
      sku,
      tamanho,
      cor,
      cor_hex,
      quantidade_enviada,
      quantidade_vendida,
      quantidade_devolvida,
      preco_venda_sugerido,
      valor_repasse_base,
      frete_rateado_unitario,
      custo_unitario,
      comissao_percentual
    ) values (
      v_remessa_id,
      v_produto_id,
      v_variacao_id,
      v_tamanho_id,
      v_produto_nome,
      v_sku,
      v_tamanho,
      v_cor,
      v_cor_hex,
      v_quantidade,
      0,
      0,
      v_preco,
      v_repasse_base,
      v_frete_rateado,
      coalesce(v_custo, 0),
      v_comissao
    );

    v_total_valor := v_total_valor + (v_preco * v_quantidade);
  end loop;

  update public.revenda_remessas
  set total_pecas_enviadas = v_total_pecas,
      total_valor_enviado = v_total_valor
  where id = v_remessa_id;

  return jsonb_build_object(
    'sucesso', true,
    'remessa_id', v_remessa_id,
    'numero', v_numero,
    'total_pecas', v_total_pecas,
    'total_valor', v_total_valor,
    'frete', v_frete,
    'frete_rateado_unitario', v_frete_rateado
  );
end;
$function$;

-- 4. Atualizar RPC editar_remessa_consignacao
create or replace function public.editar_remessa_consignacao(
  p_remessa_id bigint,
  p_observacao text default null,
  p_responsavel text default null,
  p_itens jsonb default '[]'::jsonb,
  p_frete numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_remessa public.revenda_remessas%rowtype;
  v_item jsonb;
  v_item_id bigint;
  v_produto_id bigint;
  v_tamanho_id bigint;
  v_tamanho text;
  v_cor text;
  v_cor_hex text;
  v_variacao_id bigint;
  v_quantidade integer;
  v_repasse_base numeric(10,2);
  v_frete_rateado numeric(10,2) := 0.00;
  v_preco numeric(10,2);
  v_comissao numeric(5,2);
  v_existing_item public.revenda_remessa_itens%rowtype;
  v_movimentado integer;
  v_delta integer;
  v_produto_nome text;
  v_sku text;
  v_estoque_loja integer;
  v_tamanho_estoque integer;
  v_custo numeric(10,2);
  v_total_pecas integer := 0;
  v_total_valor numeric(12,2) := 0;
  v_total_vendidas integer := 0;
  v_total_devolvidas integer := 0;
  v_novo_status text;
  v_processados_ids bigint[] := array[]::bigint[];
  v_db_item public.revenda_remessa_itens%rowtype;
  v_frete numeric(10,2);
begin
  if not public.e_admin_ou_socio() then
    raise exception 'Acesso restrito a administradores e sócios' using errcode = '42501';
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'A remessa precisa conter ao menos um item' using errcode = '22023';
  end if;

  select * into v_remessa from public.revenda_remessas where id = p_remessa_id for update;
  if not found then
    raise exception 'Remessa % não encontrada', p_remessa_id using errcode = 'P0002';
  end if;

  if p_frete is not null then
    v_frete := greatest(0.00, coalesce(p_frete, 0.00));
  else
    v_frete := coalesce(v_remessa.frete, 0.00);
  end if;

  -- 1. Calcular total de peças enviadas após as alterações para recalcular rateio
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_total_pecas := v_total_pecas + coalesce((v_item->>'quantidade')::integer, (v_item->>'quantidade_enviada')::integer, 0);
  end loop;

  if v_total_pecas > 0 and v_frete > 0 then
    v_frete_rateado := round((v_frete / v_total_pecas)::numeric, 2);
  else
    v_frete_rateado := 0.00;
  end if;

  -- 2. Processar itens
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_item_id := nullif(v_item->>'id', '')::bigint;
    v_produto_id := (v_item->>'produto_id')::bigint;
    v_tamanho_id := nullif(v_item->>'produto_tamanho_id', '')::bigint;
    v_tamanho := nullif(btrim(v_item->>'tamanho'), '');
    v_quantidade := coalesce((v_item->>'quantidade')::integer, (v_item->>'quantidade_enviada')::integer, 0);
    v_comissao := coalesce((v_item->>'comissao_percentual')::numeric, v_remessa.comissao_padrao_remessa);
    v_cor := nullif(btrim(v_item->>'cor'), '');
    v_cor_hex := nullif(btrim(v_item->>'cor_hex'), '');
    v_variacao_id := nullif(v_item->>'variacao_id', '')::bigint;

    if v_quantidade <= 0 then
      raise exception 'A quantidade do produto deve ser maior que zero' using errcode = '22023';
    end if;

    if v_item_id is not null then
      select * into v_existing_item from public.revenda_remessa_itens where id = v_item_id and remessa_id = p_remessa_id for update;
      if not found then
        raise exception 'Item % não pertence à remessa %', v_item_id, p_remessa_id using errcode = 'P0002';
      end if;

      v_movimentado := v_existing_item.quantidade_vendida + v_existing_item.quantidade_devolvida;
      if v_quantidade < v_movimentado then
        raise exception 'Não é permitido alterar a quantidade total para menos do que já foi movimentado (Mínimo: % un., Solicitado: % un.)',
          v_movimentado, v_quantidade using errcode = 'P0001';
      end if;

      v_delta := v_quantidade - v_existing_item.quantidade_enviada;

      if v_delta > 0 then
        select nome, quantidade into v_produto_nome, v_estoque_loja from public.produtos where id = v_existing_item.produto_id for update;
        if v_estoque_loja < v_delta then
          raise exception 'Estoque insuficiente na loja para aumentar a remessa do produto % (Disponível na loja: %, Adicional solicitado: %)',
            v_produto_nome, v_estoque_loja, v_delta using errcode = 'P0001';
        end if;

        if v_existing_item.produto_tamanho_id is not null then
          select quantidade into v_tamanho_estoque from public.produto_tamanhos where id = v_existing_item.produto_tamanho_id for update;
          if v_tamanho_estoque < v_delta then
            raise exception 'Estoque insuficiente para o tamanho % na loja (Disponível: %, Adicional: %)',
              v_existing_item.tamanho, v_tamanho_estoque, v_delta using errcode = 'P0001';
          end if;

          update public.produto_tamanhos set quantidade = quantidade - v_delta where id = v_existing_item.produto_tamanho_id;
        end if;

        update public.produtos set quantidade = quantidade - v_delta where id = v_existing_item.produto_id;
      elsif v_delta < 0 then
        if v_existing_item.produto_tamanho_id is not null then
          update public.produto_tamanhos set quantidade = quantidade + (-v_delta) where id = v_existing_item.produto_tamanho_id;
        end if;

        update public.produtos set quantidade = quantidade + (-v_delta) where id = v_existing_item.produto_id;
      end if;

      -- Preserva repasse base original caso não tenha sido alterado explicitamente
      v_repasse_base := coalesce(
        nullif((v_item->>'valor_repasse_base')::numeric, 0),
        v_existing_item.valor_repasse_base,
        (v_item->>'preco_venda_sugerido')::numeric,
        v_existing_item.preco_venda_sugerido
      );
      v_preco := v_repasse_base + v_frete_rateado;

      update public.revenda_remessa_itens
      set quantidade_enviada = v_quantidade,
          valor_repasse_base = v_repasse_base,
          frete_rateado_unitario = v_frete_rateado,
          preco_venda_sugerido = v_preco,
          comissao_percentual = v_comissao,
          atualizado_em = now()
      where id = v_existing_item.id;

      v_processados_ids := v_processados_ids || v_existing_item.id;

    else
      -- Novo item adicionado durante a edição
      select nome, sku, quantidade, custo into v_produto_nome, v_sku, v_estoque_loja, v_custo from public.produtos where id = v_produto_id for update;
      if not found then
        raise exception 'Produto % não encontrado', v_produto_id using errcode = 'P0002';
      end if;

      if v_estoque_loja < v_quantidade then
        raise exception 'Estoque insuficiente na loja para o produto % (Disponível: %, Solicitado: %)',
          v_produto_nome, v_estoque_loja, v_quantidade using errcode = 'P0001';
      end if;

      if v_tamanho_id is not null then
        select quantidade, variacao_id into v_tamanho_estoque, v_variacao_id from public.produto_tamanhos where id = v_tamanho_id for update;
        if v_tamanho_estoque < v_quantidade then
          raise exception 'Estoque insuficiente para o tamanho % (Disponível: %, Solicitado: %)',
            v_tamanho, v_tamanho_estoque, v_quantidade using errcode = 'P0001';
        end if;

        update public.produto_tamanhos set quantidade = quantidade - v_quantidade where id = v_tamanho_id;
      end if;

      update public.produtos set quantidade = quantidade - v_quantidade where id = v_produto_id;

      v_repasse_base := coalesce((v_item->>'valor_repasse_base')::numeric, (v_item->>'preco_venda_sugerido')::numeric, 0.00);
      v_preco := v_repasse_base + v_frete_rateado;

      insert into public.revenda_remessa_itens (
        remessa_id,
        produto_id,
        produto_tamanho_id,
        variacao_id,
        produto_nome,
        sku,
        tamanho,
        cor,
        cor_hex,
        quantidade_enviada,
        quantidade_vendida,
        quantidade_devolvida,
        preco_venda_sugerido,
        valor_repasse_base,
        frete_rateado_unitario,
        custo_unitario,
        comissao_percentual
      ) values (
        p_remessa_id,
        v_produto_id,
        v_tamanho_id,
        v_variacao_id,
        v_produto_nome,
        v_sku,
        v_tamanho,
        v_cor,
        v_cor_hex,
        v_quantidade,
        0,
        0,
        v_preco,
        v_repasse_base,
        v_frete_rateado,
        coalesce(v_custo, 0),
        v_comissao
      ) returning id into v_item_id;

      v_processados_ids := v_processados_ids || v_item_id;
    end if;
  end loop;

  -- 3. Tratar itens removidos
  for v_db_item in select * from public.revenda_remessa_itens where remessa_id = p_remessa_id and not (id = any(v_processados_ids))
  loop
    v_movimentado := v_db_item.quantidade_vendida + v_db_item.quantidade_devolvida;
    if v_movimentado > 0 then
      raise exception 'Não é permitido remover da remessa o produto % pois já possui movimentações (Vendido: % un., Devolvido: % un.)',
        v_db_item.produto_nome, v_db_item.quantidade_vendida, v_db_item.quantidade_devolvida using errcode = 'P0001';
    end if;

    if v_db_item.produto_tamanho_id is not null then
      update public.produto_tamanhos set quantidade = quantidade + v_db_item.quantidade_enviada where id = v_db_item.produto_tamanho_id;
    end if;

    update public.produtos set quantidade = quantidade + v_db_item.quantidade_enviada where id = v_db_item.produto_id;

    delete from public.revenda_remessa_itens where id = v_db_item.id;
  end loop;

  -- 4. Recalcula totais e status da remessa
  select
    coalesce(sum(quantidade_enviada), 0),
    coalesce(sum(quantidade_enviada * preco_venda_sugerido), 0),
    coalesce(sum(quantidade_vendida), 0),
    coalesce(sum(quantidade_devolvida), 0)
  into v_total_pecas, v_total_valor, v_total_vendidas, v_total_devolvidas
  from public.revenda_remessa_itens
  where remessa_id = p_remessa_id;

  if (v_total_vendidas + v_total_devolvidas) >= v_total_pecas and v_total_pecas > 0 then
    v_novo_status := 'Acertada';
  elsif (v_total_vendidas + v_total_devolvidas) > 0 then
    v_novo_status := 'Parcialmente vendida';
  else
    v_novo_status := 'Enviada';
  end if;

  update public.revenda_remessas
  set observacao = p_observacao,
      responsavel = p_responsavel,
      frete = v_frete,
      total_pecas_enviadas = v_total_pecas,
      total_valor_enviado = v_total_valor,
      status = v_novo_status,
      atualizado_em = now()
  where id = p_remessa_id;

  return jsonb_build_object(
    'sucesso', true,
    'remessa_id', p_remessa_id,
    'numero', v_remessa.numero,
    'frete', v_frete,
    'frete_rateado_unitario', v_frete_rateado,
    'total_pecas', v_total_pecas,
    'total_valor', v_total_valor,
    'status', v_novo_status
  );
end;
$function$;

commit;
