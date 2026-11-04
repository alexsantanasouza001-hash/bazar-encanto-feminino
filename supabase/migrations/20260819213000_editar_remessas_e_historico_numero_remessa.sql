-- ====================================================================
-- MIGRATION: EDIÇÃO DE REMESSAS DE CONSIGNAÇÃO E NÚMERO DE REMESSA NO HISTÓRICO
-- BAZAR ENCANTO FEMININO
-- ====================================================================

begin;

-- 1. ADICIONAR COLUNA NUMERO_REMESSA EM REVENDA_VENDAS SE NÃO EXISTIR
alter table public.revenda_vendas 
  add column if not exists numero_remessa text;

-- Backfill do número da remessa para vendas existentes
update public.revenda_vendas v
set numero_remessa = r.numero
from public.revenda_remessas r
where v.remessa_id = r.id
  and v.numero_remessa is null;

-- 2. ATUALIZAR RPC REGISTRAR_VENDA_CONSIGNADA COM GRAVAÇÃO DO NUMERO_REMESSA
create or replace function public.registrar_venda_consignada(
  p_remessa_item_id bigint,
  p_quantidade integer,
  p_preco_unitario numeric,
  p_data_venda timestamptz default now(),
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_item public.revenda_remessa_itens%rowtype;
  v_remessa public.revenda_remessas%rowtype;
  v_revendedora public.revendedoras%rowtype;
  v_saldo_consignado integer;
  v_valor_bruto numeric(10,2);
  v_valor_comissao numeric(10,2);
  v_valor_loja numeric(10,2);
  v_venda_id bigint;
  v_total_enviado integer;
  v_total_vendido integer;
  v_total_devolvido integer;
  v_novo_status text;
begin
  -- Exigir perfil de Administrador ou Sócio ativo
  if not public.e_admin_ou_socio() then
    raise exception 'Acesso restrito a administradores e sócios' using errcode = '42501';
  end if;

  if p_quantidade <= 0 or p_preco_unitario <= 0 then
    raise exception 'Quantidade e preço de venda devem ser maiores que zero' using errcode = '22023';
  end if;

  select * into v_item from public.revenda_remessa_itens where id = p_remessa_item_id for update;
  if not found then
    raise exception 'Item da remessa não encontrado' using errcode = 'P0002';
  end if;

  select * into v_remessa from public.revenda_remessas where id = v_item.remessa_id;
  select * into v_revendedora from public.revendedoras where id = v_remessa.revendedora_id;

  v_saldo_consignado := v_item.quantidade_enviada - v_item.quantidade_vendida - v_item.quantidade_devolvida;
  if v_saldo_consignado < p_quantidade then
    raise exception 'Quantidade informada (%) maior que o saldo consignado disponível (%)',
      p_quantidade, v_saldo_consignado using errcode = 'P0001';
  end if;

  -- Comissão calculada sobre o VALOR REAL DA VENDA
  v_valor_bruto := p_quantidade * p_preco_unitario;
  v_valor_comissao := round(v_valor_bruto * (v_item.comissao_percentual / 100.0), 2);
  v_valor_loja := v_valor_bruto - v_valor_comissao;

  update public.revenda_remessa_itens
  set quantidade_vendida = quantidade_vendida + p_quantidade,
      atualizado_em = now()
  where id = p_remessa_item_id;

  insert into public.revenda_vendas (
    remessa_item_id,
    remessa_id,
    numero_remessa,
    revendedora_id,
    produto_id,
    produto_tamanho_id,
    variacao_id,
    produto_nome,
    tamanho,
    cor,
    cor_hex,
    quantidade,
    valor_repasse_unitario,
    preco_unitario_vendido,
    valor_total_bruto,
    comissao_percentual,
    valor_comissao,
    valor_loja,
    data_venda,
    observacao
  ) values (
    p_remessa_item_id,
    v_item.remessa_id,
    v_remessa.numero,
    v_remessa.revendedora_id,
    v_item.produto_id,
    v_item.produto_tamanho_id,
    v_item.variacao_id,
    v_item.produto_nome,
    v_item.tamanho,
    v_item.cor,
    v_item.cor_hex,
    p_quantidade,
    coalesce(v_item.preco_venda_sugerido, 0),
    p_preco_unitario,
    v_valor_bruto,
    v_item.comissao_percentual,
    v_valor_comissao,
    v_valor_loja,
    coalesce(p_data_venda, now()),
    p_observacao
  ) returning id into v_venda_id;

  select sum(quantidade_enviada), sum(quantidade_vendida), sum(quantidade_devolvida)
  into v_total_enviado, v_total_vendido, v_total_devolvido
  from public.revenda_remessa_itens
  where remessa_id = v_item.remessa_id;

  if (v_total_vendido + v_total_devolvido) >= v_total_enviado then
    v_novo_status := 'Acertada';
  else
    v_novo_status := 'Parcialmente vendida';
  end if;

  update public.revenda_remessas
  set status = v_novo_status,
      atualizado_em = now()
  where id = v_item.remessa_id;

  return jsonb_build_object(
    'sucesso', true,
    'venda_id', v_venda_id,
    'numero_remessa', v_remessa.numero,
    'quantidade', p_quantidade,
    'valor_repasse_unitario', v_item.preco_venda_sugerido,
    'preco_unitario_vendido', p_preco_unitario,
    'valor_bruto', v_valor_bruto,
    'comissao', v_valor_comissao,
    'valor_loja', v_valor_loja
  );
end;
$function$;

-- 3. ATUALIZAR RPC REGISTRAR_VENDAS_CONSIGNADAS_LOTE COM GRAVAÇÃO DO NUMERO_REMESSA
create or replace function public.registrar_vendas_consignadas_lote(
  p_remessa_item_id bigint,
  p_vendas jsonb,
  p_data_venda timestamptz default now(),
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_item public.revenda_remessa_itens%rowtype;
  v_remessa public.revenda_remessas%rowtype;
  v_saldo_consignado integer;
  v_item_venda jsonb;
  v_qtd integer;
  v_preco numeric(10,2);
  v_total_qtd integer := 0;
  v_total_bruto numeric(10,2) := 0;
  v_total_comissao numeric(10,2) := 0;
  v_total_loja numeric(10,2) := 0;
  v_item_bruto numeric(10,2);
  v_item_comissao numeric(10,2);
  v_item_loja numeric(10,2);
  v_venda_id bigint;
  v_vendas_ids jsonb := '[]'::jsonb;
  v_total_enviado integer;
  v_total_vendido integer;
  v_total_devolvido integer;
  v_novo_status text;
begin
  -- Exigir perfil de Administrador ou Sócio ativo
  if not public.e_admin_ou_socio() then
    raise exception 'Acesso restrito a administradores e sócios' using errcode = '42501';
  end if;

  if p_vendas is null or jsonb_array_length(p_vendas) = 0 then
    raise exception 'Nenhuma linha de venda foi informada' using errcode = '22023';
  end if;

  select * into v_item from public.revenda_remessa_itens where id = p_remessa_item_id for update;
  if not found then
    raise exception 'Item da remessa não encontrado' using errcode = 'P0002';
  end if;

  select * into v_remessa from public.revenda_remessas where id = v_item.remessa_id;

  v_saldo_consignado := v_item.quantidade_enviada - v_item.quantidade_vendida - v_item.quantidade_devolvida;

  -- 1ª Validação: soma e integridade de cada linha
  for v_item_venda in select * from jsonb_array_elements(p_vendas)
  loop
    v_qtd := coalesce((v_item_venda->>'quantidade')::integer, 0);
    v_preco := coalesce((v_item_venda->>'preco_unitario')::numeric, 0);

    if v_qtd <= 0 then
      raise exception 'Quantidade inválida informada na linha de venda' using errcode = '22023';
    end if;

    if v_preco <= 0 then
      raise exception 'Valor de venda inválido informado na linha de venda' using errcode = '22023';
    end if;

    v_total_qtd := v_total_qtd + v_qtd;
  end loop;

  if v_total_qtd > v_saldo_consignado then
    raise exception 'Quantidade total informada (%) maior que o saldo consignado disponível (%)',
      v_total_qtd, v_saldo_consignado using errcode = 'P0001';
  end if;

  -- 2ª Gravação: insere cada grupo de venda preservando histórico exato com numero_remessa
  for v_item_venda in select * from jsonb_array_elements(p_vendas)
  loop
    v_qtd := (v_item_venda->>'quantidade')::integer;
    v_preco := (v_item_venda->>'preco_unitario')::numeric;

    v_item_bruto := v_qtd * v_preco;
    v_item_comissao := round(v_item_bruto * (v_item.comissao_percentual / 100.0), 2);
    v_item_loja := v_item_bruto - v_item_comissao;

    insert into public.revenda_vendas (
      remessa_item_id,
      remessa_id,
      numero_remessa,
      revendedora_id,
      produto_id,
      produto_tamanho_id,
      variacao_id,
      produto_nome,
      tamanho,
      cor,
      cor_hex,
      quantidade,
      valor_repasse_unitario,
      preco_unitario_vendido,
      valor_total_bruto,
      comissao_percentual,
      valor_comissao,
      valor_loja,
      data_venda,
      observacao
    ) values (
      p_remessa_item_id,
      v_item.remessa_id,
      v_remessa.numero,
      v_remessa.revendedora_id,
      v_item.produto_id,
      v_item.produto_tamanho_id,
      v_item.variacao_id,
      v_item.produto_nome,
      v_item.tamanho,
      v_item.cor,
      v_item.cor_hex,
      v_qtd,
      coalesce(v_item.preco_venda_sugerido, 0),
      v_preco,
      v_item_bruto,
      v_item.comissao_percentual,
      v_item_comissao,
      v_item_loja,
      coalesce(p_data_venda, now()),
      p_observacao
    ) returning id into v_venda_id;

    v_vendas_ids := v_vendas_ids || jsonb_build_object(
      'venda_id', v_venda_id,
      'numero_remessa', v_remessa.numero,
      'quantidade', v_qtd,
      'preco_unitario_vendido', v_preco,
      'valor_repasse_unitario', v_item.preco_venda_sugerido,
      'valor_bruto', v_item_bruto,
      'comissao', v_item_comissao,
      'valor_loja', v_item_loja
    );

    v_total_bruto := v_total_bruto + v_item_bruto;
    v_total_comissao := v_total_comissao + v_item_comissao;
    v_total_loja := v_total_loja + v_item_loja;
  end loop;

  -- Atualiza o item da remessa com o total vendido acumulado
  update public.revenda_remessa_itens
  set quantidade_vendida = quantidade_vendida + v_total_qtd,
      atualizado_em = now()
  where id = p_remessa_item_id;

  -- Atualiza status da remessa
  select sum(quantidade_enviada), sum(quantidade_vendida), sum(quantidade_devolvida)
  into v_total_enviado, v_total_vendido, v_total_devolvido
  from public.revenda_remessa_itens
  where remessa_id = v_item.remessa_id;

  if (v_total_vendido + v_total_devolvido) >= v_total_enviado then
    v_novo_status := 'Acertada';
  else
    v_novo_status := 'Parcialmente vendida';
  end if;

  update public.revenda_remessas
  set status = v_novo_status,
      atualizado_em = now()
  where id = v_item.remessa_id;

  return jsonb_build_object(
    'sucesso', true,
    'numero_remessa', v_remessa.numero,
    'total_unidades', v_total_qtd,
    'total_bruto', v_total_bruto,
    'total_comissao', v_total_comissao,
    'total_loja', v_total_loja,
    'vendas', v_vendas_ids
  );
end;
$function$;

-- 4. NOVA RPC ATÔMICA: EDITAR REMESSA CONSIGNADA COM REGRAS DE SEGURANÇA DE ESTOQUE
create or replace function public.editar_remessa_consignacao(
  p_remessa_id bigint,
  p_observacao text default null,
  p_responsavel text default null,
  p_itens jsonb default '[]'::jsonb
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
begin
  -- 1. Permissão: Admin ou Sócio
  if not public.e_admin_ou_socio() then
    raise exception 'Acesso restrito a administradores e sócios' using errcode = '42501';
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'A remessa precisa conter ao menos um item' using errcode = '22023';
  end if;

  -- 2. Lock na remessa
  select * into v_remessa from public.revenda_remessas where id = p_remessa_id for update;
  if not found then
    raise exception 'Remessa % não encontrada', p_remessa_id using errcode = 'P0002';
  end if;

  -- 3. Processar itens enviados no payload
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_item_id := nullif(v_item->>'id', '')::bigint;
    v_produto_id := (v_item->>'produto_id')::bigint;
    v_tamanho_id := nullif(v_item->>'produto_tamanho_id', '')::bigint;
    v_tamanho := nullif(btrim(v_item->>'tamanho'), '');
    v_quantidade := coalesce((v_item->>'quantidade')::integer, (v_item->>'quantidade_enviada')::integer, 0);
    v_preco := coalesce((v_item->>'preco_venda_sugerido')::numeric, 0);
    v_comissao := coalesce((v_item->>'comissao_percentual')::numeric, v_remessa.comissao_padrao_remessa);
    v_cor := nullif(btrim(v_item->>'cor'), '');
    v_cor_hex := nullif(btrim(v_item->>'cor_hex'), '');
    v_variacao_id := nullif(v_item->>'variacao_id', '')::bigint;

    if v_quantidade <= 0 then
      raise exception 'A quantidade do produto deve ser maior que zero' using errcode = '22023';
    end if;

    if v_item_id is not null then
      -- Item existente na remessa
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
        -- Aumentou quantidade: debitar da loja
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

          update public.produto_tamanhos set quantidade = quantidade - v_delta, atualizado_em = now() where id = v_existing_item.produto_tamanho_id;
        end if;

        update public.produtos set quantidade = quantidade - v_delta, atualizado_em = now() where id = v_existing_item.produto_id;
      elsif v_delta < 0 then
        -- Diminuiu quantidade: devolver saldo não vendido à loja
        if v_existing_item.produto_tamanho_id is not null then
          update public.produto_tamanhos set quantidade = quantidade + (-v_delta), atualizado_em = now() where id = v_existing_item.produto_tamanho_id;
        end if;

        update public.produtos set quantidade = quantidade + (-v_delta), atualizado_em = now() where id = v_existing_item.produto_id;
      end if;

      -- Atualiza os dados do item da remessa
      update public.revenda_remessa_itens
      set quantidade_enviada = v_quantidade,
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

        update public.produto_tamanhos set quantidade = quantidade - v_quantidade, atualizado_em = now() where id = v_tamanho_id;
      end if;

      update public.produtos set quantidade = quantidade - v_quantidade, atualizado_em = now() where id = v_produto_id;

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
        coalesce(v_custo, 0),
        v_comissao
      ) returning id into v_item_id;

      v_processados_ids := v_processados_ids || v_item_id;
    end if;
  end loop;

  -- 4. Tratar itens removidos da remessa
  for v_db_item in select * from public.revenda_remessa_itens where remessa_id = p_remessa_id and not (id = any(v_processados_ids))
  loop
    v_movimentado := v_db_item.quantidade_vendida + v_db_item.quantidade_devolvida;
    if v_movimentado > 0 then
      raise exception 'Não é permitido remover da remessa o produto % pois já possui movimentações (Vendido: % un., Devolvido: % un.)',
        v_db_item.produto_nome, v_db_item.quantidade_vendida, v_db_item.quantidade_devolvida using errcode = 'P0001';
    end if;

    -- Devolve o estoque total do item para a loja
    if v_db_item.produto_tamanho_id is not null then
      update public.produto_tamanhos set quantidade = quantidade + v_db_item.quantidade_enviada, atualizado_em = now() where id = v_db_item.produto_tamanho_id;
    end if;

    update public.produtos set quantidade = quantidade + v_db_item.quantidade_enviada, atualizado_em = now() where id = v_db_item.produto_id;

    delete from public.revenda_remessa_itens where id = v_db_item.id;
  end loop;

  -- 5. Recalcula totais e status da remessa
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
      total_pecas_enviadas = v_total_pecas,
      total_valor_enviado = v_total_valor,
      status = v_novo_status,
      atualizado_em = now()
  where id = p_remessa_id;

  return jsonb_build_object(
    'sucesso', true,
    'remessa_id', p_remessa_id,
    'numero', v_remessa.numero,
    'total_pecas', v_total_pecas,
    'total_valor', v_total_valor,
    'status', v_novo_status
  );
end;
$function$;

-- 5. PERMISSÕES DE EXECUÇÃO
revoke all privileges on function public.editar_remessa_consignacao(bigint, text, text, jsonb) from public, anon;
grant execute on function public.editar_remessa_consignacao(bigint, text, text, jsonb) to authenticated, service_role;

commit;
