-- ====================================================================
-- MIGRATION: CÁLCULO DA COMISSÃO SOBRE TOTAL FINAL APÓS DESCONTO
-- ====================================================================

begin;

-- 1. ATUALIZAR RPC REGISTRAR_VENDA_CONSIGNADA
create or replace function public.registrar_venda_consignada(
  p_remessa_item_id bigint,
  p_quantidade integer,
  p_preco_unitario numeric,
  p_data_venda timestamptz default now(),
  p_observacao text default null,
  p_percentual_desconto numeric default 0.00
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
  v_valor_subtotal numeric(10,2);
  v_desc_percent numeric(5,2);
  v_valor_desconto numeric(10,2);
  v_total_venda numeric(10,2);
  v_repasse_total numeric(10,2);
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

  v_desc_percent := coalesce(p_percentual_desconto, 0.00);
  if v_desc_percent < 0 or v_desc_percent > 100 then
    raise exception 'Percentual de desconto inválido (deve ser entre 0%% e 100%%)' using errcode = '22023';
  end if;

  select * into v_item from public.revenda_remessa_itens where id = p_remessa_item_id for update;
  if not found then
    raise exception 'Item da remessa não encontrado' using errcode = 'P0002';
  end if;

  select * into v_remessa from public.revenda_remessas where id = v_item.remessa_id;

  v_saldo_consignado := v_item.quantidade_enviada - v_item.quantidade_vendida - v_item.quantidade_devolvida;
  if v_saldo_consignado < p_quantidade then
    raise exception 'Quantidade informada (%) maior que o saldo consignado disponível (%)',
      p_quantidade, v_saldo_consignado using errcode = 'P0001';
  end if;

  -- 1. Calcular subtotal
  v_valor_subtotal := p_quantidade * p_preco_unitario;
  -- 2. Aplicar desconto percentual
  v_valor_desconto := round(v_valor_subtotal * (v_desc_percent / 100.0), 2);
  -- 3. Encontrar TOTAL FINAL DA VENDA
  v_total_venda := v_valor_subtotal - v_valor_desconto;
  v_repasse_total := p_quantidade * coalesce(v_item.preco_venda_sugerido, 0);

  -- 4. Calcular comissão SOBRE O TOTAL FINAL APÓS DESCONTO
  -- Se Total Final <= Valor de Repasse Aplicável => Comissão = 0
  -- Se Total Final > Valor de Repasse Aplicável => Comissão sobre o Total Final
  if v_total_venda <= v_repasse_total then
    v_valor_comissao := 0.00;
  else
    v_valor_comissao := round(v_total_venda * (v_item.comissao_percentual / 100.0), 2);
  end if;

  v_valor_loja := v_total_venda - v_valor_comissao;

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
    subtotal_venda,
    percentual_desconto,
    valor_desconto,
    total_venda,
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
    v_valor_subtotal,
    v_desc_percent,
    v_valor_desconto,
    v_total_venda,
    v_valor_subtotal,
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
    'subtotal_venda', v_valor_subtotal,
    'percentual_desconto', v_desc_percent,
    'valor_desconto', v_valor_desconto,
    'total_venda', v_total_venda,
    'valor_bruto', v_valor_subtotal,
    'comissao', v_valor_comissao,
    'valor_loja', v_valor_loja
  );
end;
$function$;

-- 2. ATUALIZAR RPC REGISTRAR_VENDAS_CONSIGNADAS_LOTE
create or replace function public.registrar_vendas_consignadas_lote(
  p_remessa_item_id bigint,
  p_vendas jsonb,
  p_data_venda timestamptz default now(),
  p_observacao text default null,
  p_percentual_desconto numeric default 0.00
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
  v_total_subtotal numeric(10,2) := 0;
  v_total_desconto numeric(10,2) := 0;
  v_total_venda_geral numeric(10,2) := 0;
  v_total_comissao numeric(10,2) := 0;
  v_total_loja numeric(10,2) := 0;
  v_desc_percent numeric(5,2);
  v_item_subtotal numeric(10,2);
  v_item_desconto numeric(10,2);
  v_item_total numeric(10,2);
  v_item_repasse_total numeric(10,2);
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

  v_desc_percent := coalesce(p_percentual_desconto, 0.00);
  if v_desc_percent < 0 or v_desc_percent > 100 then
    raise exception 'Percentual de desconto inválido (deve ser entre 0%% e 100%%)' using errcode = '22023';
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

  -- 2ª Gravação: insere cada grupo de venda calculando comissão sobre total_venda após desconto
  for v_item_venda in select * from jsonb_array_elements(p_vendas)
  loop
    v_qtd := (v_item_venda->>'quantidade')::integer;
    v_preco := (v_item_venda->>'preco_unitario')::numeric;

    v_item_subtotal := v_qtd * v_preco;
    v_item_desconto := round(v_item_subtotal * (v_desc_percent / 100.0), 2);
    v_item_total := v_item_subtotal - v_item_desconto;
    v_item_repasse_total := v_qtd * coalesce(v_item.preco_venda_sugerido, 0);

    -- REGRA OBRIGATÓRIA:
    -- Se Total Final da Linha <= Repasse da Linha => Comissão = 0
    -- Se Total Final da Linha > Repasse da Linha => Comissão sobre Total Final da Linha
    if v_item_total <= v_item_repasse_total then
      v_item_comissao := 0.00;
    else
      v_item_comissao := round(v_item_total * (v_item.comissao_percentual / 100.0), 2);
    end if;

    v_item_loja := v_item_total - v_item_comissao;

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
      subtotal_venda,
      percentual_desconto,
      valor_desconto,
      total_venda,
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
      v_item_subtotal,
      v_desc_percent,
      v_item_desconto,
      v_item_total,
      v_item_subtotal,
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
      'subtotal_venda', v_item_subtotal,
      'percentual_desconto', v_desc_percent,
      'valor_desconto', v_item_desconto,
      'total_venda', v_item_total,
      'valor_bruto', v_item_subtotal,
      'comissao', v_item_comissao,
      'valor_loja', v_item_loja
    );

    v_total_subtotal := v_total_subtotal + v_item_subtotal;
    v_total_desconto := v_total_desconto + v_item_desconto;
    v_total_venda_geral := v_total_venda_geral + v_item_total;
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
    'subtotal_venda', v_total_subtotal,
    'percentual_desconto', v_desc_percent,
    'valor_desconto', v_total_desconto,
    'total_venda', v_total_venda_geral,
    'total_bruto', v_total_subtotal,
    'total_comissao', v_total_comissao,
    'total_loja', v_total_loja,
    'vendas', v_vendas_ids
  );
end;
$function$;

revoke all privileges on function public.registrar_venda_consignada(bigint, integer, numeric, timestamptz, text, numeric) from public, anon;
grant execute on function public.registrar_venda_consignada(bigint, integer, numeric, timestamptz, text, numeric) to authenticated, service_role;

revoke all privileges on function public.registrar_vendas_consignadas_lote(bigint, jsonb, timestamptz, text, numeric) from public, anon;
grant execute on function public.registrar_vendas_consignadas_lote(bigint, jsonb, timestamptz, text, numeric) to authenticated, service_role;

commit;
