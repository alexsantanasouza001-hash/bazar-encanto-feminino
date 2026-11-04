-- ====================================================================
-- MIGRATION: EDIÇÃO DE VENDA PENDENTE E DESCONTO MONETÁRIO NO PORTAL
-- ====================================================================

-- 1. DROPAR SOBRECARGA ANTERIOR SE EXISTIR
drop function if exists public.registrar_venda_portal_revendedora(bigint, integer, numeric, text, timestamptz, text, numeric, text);

-- 2. RECRIAR RPC REGISTRAR VENDA PORTAL COM SUPORTE A DESCONTO MONETÁRIO
create or replace function public.registrar_venda_portal_revendedora(
  p_remessa_item_id bigint,
  p_quantidade integer,
  p_preco_unitario numeric,
  p_forma_pagamento text default 'Pix',
  p_data_venda timestamptz default now(),
  p_observacao text default null,
  p_percentual_desconto numeric default 0.00,
  p_idempotency_key text default null,
  p_valor_desconto numeric default 0.00
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_revendedora_id bigint;
  v_revendedora public.revendedoras%rowtype;
  v_item public.revenda_remessa_itens%rowtype;
  v_remessa public.revenda_remessas%rowtype;
  v_saldo_disponivel integer;
  v_desc_percent numeric(5,2);
  v_subtotal numeric(10,2);
  v_desconto numeric(10,2);
  v_total numeric(10,2);
  v_repasse_total numeric(10,2);
  v_comissao numeric(10,2);
  v_loja numeric(10,2);
  v_venda_id bigint;
  v_venda_existente public.revenda_vendas%rowtype;
begin
  -- 1. Obter e validar a revendedora logada
  v_revendedora_id := public.obter_minha_revendedora_id();
  if v_revendedora_id is null then
    raise exception 'Acesso negado: revendedora não autenticada ou sem acesso ativo' using errcode = '42501';
  end if;

  select * into v_revendedora from public.revendedoras where id = v_revendedora_id;
  if not found or v_revendedora.status_acesso != 'ATIVO' or v_revendedora.status != 'Ativa' then
    raise exception 'Acesso da revendedora bloqueado ou inativo' using errcode = '42501';
  end if;

  -- 2. Proteção de idempotência: verificar se chave já foi processada
  if p_idempotency_key is not null and btrim(p_idempotency_key) != '' then
    select * into v_venda_existente from public.revenda_vendas where idempotency_key = btrim(p_idempotency_key);
    if found then
      return jsonb_build_object(
        'sucesso', true,
        'mensagem', 'Venda já registrada anteriormente.',
        'venda_id', v_venda_existente.id,
        'status', v_venda_existente.status,
        'duplicado', true
      );
    end if;
  end if;

  -- 3. Validações básicas de quantidade e preço
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade deve ser maior que zero' using errcode = '22023';
  end if;

  if p_preco_unitario is null or p_preco_unitario <= 0 then
    raise exception 'O preço unitário de venda deve ser maior que zero' using errcode = '22023';
  end if;

  if p_forma_pagamento not in ('Pix', 'Dinheiro', 'Cartão', 'Transferência', 'Outro') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023';
  end if;

  -- 4. Bloqueio transacional do item da remessa (SELECT ... FOR UPDATE) para garantir concorrência
  select * into v_item from public.revenda_remessa_itens
  where id = p_remessa_item_id
  for update;

  if not found then
    raise exception 'Item da remessa não encontrado' using errcode = 'P0002';
  end if;

  -- 5. Validar se o item pertence de fato a uma remessa da revendedora logada
  select * into v_remessa from public.revenda_remessas where id = v_item.remessa_id;
  if not found or v_remessa.revendedora_id != v_revendedora_id then
    raise exception 'Este item não pertence às suas remessas' using errcode = '42501';
  end if;

  -- 6. Calcular saldo disponível com reserva lógica
  v_saldo_disponivel := v_item.quantidade_enviada - v_item.quantidade_vendida - v_item.quantidade_devolvida - coalesce(v_item.quantidade_reservada, 0);

  if v_saldo_disponivel < p_quantidade then
    raise exception 'Quantidade não disponível. Disponível para venda: % unidade(s)', v_saldo_disponivel using errcode = 'P0001';
  end if;

  -- 7. Cálculos financeiros oficiais
  v_subtotal := round(p_quantidade * p_preco_unitario, 2);

  if p_valor_desconto is not null and p_valor_desconto > 0 then
    v_desconto := round(p_valor_desconto, 2);
    if v_desconto < 0 or v_desconto > v_subtotal then
      raise exception 'Desconto não pode ser negativo ou maior que o valor da venda' using errcode = '22023';
    end if;
    if v_subtotal > 0 then
      v_desc_percent := round((v_desconto / v_subtotal) * 100.0, 2);
    else
      v_desc_percent := 0.00;
    end if;
  else
    v_desc_percent := coalesce(p_percentual_desconto, 0.00);
    if v_desc_percent < 0 or v_desc_percent > 100 then
      raise exception 'Percentual de desconto inválido' using errcode = '22023';
    end if;
    v_desconto := round(v_subtotal * (v_desc_percent / 100.0), 2);
  end if;

  v_total := round(v_subtotal - v_desconto, 2);
  v_repasse_total := round(p_quantidade * coalesce(v_item.preco_venda_sugerido, 0), 2);

  -- Regra oficial de comissão do Bazar:
  -- Se total final <= repasse => comissão 0
  -- Se total final > repasse => comissão percentual sobre total final
  if v_total <= v_repasse_total then
    v_comissao := 0.00;
  else
    v_comissao := round(v_total * (v_item.comissao_percentual / 100.0), 2);
  end if;
  v_loja := round(v_total - v_comissao, 2);

  -- 8. Reservar quantidade logicamente no banco de dados (não baixa estoque definitivo ainda)
  update public.revenda_remessa_itens
  set quantidade_reservada = coalesce(quantidade_reservada, 0) + p_quantidade,
      atualizado_em = now()
  where id = p_remessa_item_id;

  -- 9. Inserir registro com status AGUARDANDO_CONFERENCIA e origem PORTAL_REVENDEDORA
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
    observacao,
    forma_pagamento,
    status,
    origem,
    idempotency_key,
    criado_em
  ) values (
    p_remessa_item_id,
    v_item.remessa_id,
    v_remessa.numero,
    v_revendedora_id,
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
    v_subtotal,
    v_desc_percent,
    v_desconto,
    v_total,
    v_subtotal,
    v_item.comissao_percentual,
    v_comissao,
    v_loja,
    coalesce(p_data_venda, now()),
    p_observacao,
    p_forma_pagamento,
    'AGUARDANDO_CONFERENCIA',
    'PORTAL_REVENDEDORA',
    nullif(btrim(p_idempotency_key), ''),
    now()
  )
  returning id into v_venda_id;

  return jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Venda registrada com sucesso! Aguarde a conferência do Bazar.',
    'venda_id', v_venda_id,
    'status', 'AGUARDANDO_CONFERENCIA',
    'quantidade', p_quantidade,
    'total_venda', v_total,
    'valor_comissao', v_comissao,
    'valor_loja', v_loja
  );
end;
$function$;

-- 3. RPC: EDITAR VENDA PORTAL DA REVENDEDORA (REAJUSTE ATÔMICO DA RESERVA DE ESTOQUE)
drop function if exists public.editar_venda_portal_revendedora(bigint, integer, numeric, numeric, text, timestamptz, text, numeric);

create or replace function public.editar_venda_portal_revendedora(
  p_venda_id bigint,
  p_quantidade integer,
  p_preco_unitario numeric,
  p_valor_desconto numeric default 0.00,
  p_forma_pagamento text default 'Pix',
  p_data_venda timestamptz default null,
  p_observacao text default null,
  p_percentual_desconto numeric default 0.00
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_revendedora_id bigint;
  v_venda public.revenda_vendas%rowtype;
  v_item public.revenda_remessa_itens%rowtype;
  v_diferenca_qtd integer;
  v_saldo_disponivel integer;
  v_subtotal numeric(10,2);
  v_desconto numeric(10,2);
  v_desc_percent numeric(5,2);
  v_total numeric(10,2);
  v_repasse_total numeric(10,2);
  v_comissao numeric(10,2);
  v_loja numeric(10,2);
begin
  -- 1. Obter e validar a revendedora autenticada
  v_revendedora_id := public.obter_minha_revendedora_id();
  if v_revendedora_id is null then
    raise exception 'Acesso negado: revendedora não autenticada ou sem acesso ativo' using errcode = '42501';
  end if;

  -- 2. Localizar e travar a venda com FOR UPDATE
  select * into v_venda from public.revenda_vendas
  where id = p_venda_id
  for update;

  if not found then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;

  -- 3. Segurança: verificar se a venda pertence à própria revendedora autenticada
  if v_venda.revendedora_id != v_revendedora_id then
    raise exception 'Acesso negado: esta venda não pertence à sua revendedora' using errcode = '42501';
  end if;

  -- 4. Segurança: verificar status e origem
  if v_venda.status != 'AGUARDANDO_CONFERENCIA' then
    raise exception 'Apenas vendas com status AGUARDANDO_CONFERENCIA podem ser editadas pela revendedora (status atual: %)', v_venda.status using errcode = '42501';
  end if;

  if v_venda.origem != 'PORTAL_REVENDEDORA' then
    raise exception 'Apenas vendas registradas pelo Portal da Revendedora podem ser editadas' using errcode = '42501';
  end if;

  -- 5. Validações de entrada
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade deve ser maior que zero' using errcode = '22023';
  end if;

  if p_preco_unitario is null or p_preco_unitario <= 0 then
    raise exception 'O preço unitário de venda deve ser maior que zero' using errcode = '22023';
  end if;

  if p_forma_pagamento not in ('Pix', 'Dinheiro', 'Cartão', 'Transferência', 'Outro') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023';
  end if;

  -- 6. Travar o item da remessa
  select * into v_item from public.revenda_remessa_itens
  where id = v_venda.remessa_item_id
  for update;

  if not found then
    raise exception 'Item da remessa não encontrado' using errcode = 'P0002';
  end if;

  -- 7. Ajuste atômico da reserva de estoque
  v_diferenca_qtd := p_quantidade - v_venda.quantidade;

  if v_diferenca_qtd > 0 then
    -- Quantidade aumentada: verificar se há saldo físico disponível
    v_saldo_disponivel := v_item.quantidade_enviada - v_item.quantidade_vendida - v_item.quantidade_devolvida - coalesce(v_item.quantidade_reservada, 0);
    if v_saldo_disponivel < v_diferenca_qtd then
      raise exception 'Quantidade adicional não disponível. Disponível para adicionar: % unidade(s)', v_saldo_disponivel using errcode = 'P0001';
    end if;

    update public.revenda_remessa_itens
    set quantidade_reservada = coalesce(quantidade_reservada, 0) + v_diferenca_qtd,
        atualizado_em = now()
    where id = v_item.id;

  elsif v_diferenca_qtd < 0 then
    -- Quantidade diminuída: liberar a diferença da reserva
    update public.revenda_remessa_itens
    set quantidade_reservada = greatest(0, coalesce(quantidade_reservada, 0) - abs(v_diferenca_qtd)),
        atualizado_em = now()
    where id = v_item.id;
  end if;

  -- 8. Cálculos financeiros oficiais
  v_subtotal := round(p_quantidade * p_preco_unitario, 2);

  if p_valor_desconto is not null and p_valor_desconto > 0 then
    v_desconto := round(p_valor_desconto, 2);
    if v_desconto < 0 or v_desconto > v_subtotal then
      raise exception 'Desconto não pode ser negativo ou maior que o valor da venda' using errcode = '22023';
    end if;
    if v_subtotal > 0 then
      v_desc_percent := round((v_desconto / v_subtotal) * 100.0, 2);
    else
      v_desc_percent := 0.00;
    end if;
  elsif p_percentual_desconto is not null and p_percentual_desconto > 0 then
    v_desc_percent := round(p_percentual_desconto, 2);
    if v_desc_percent < 0 or v_desc_percent > 100 then
      raise exception 'Percentual de desconto inválido' using errcode = '22023';
    end if;
    v_desconto := round(v_subtotal * (v_desc_percent / 100.0), 2);
  else
    v_desconto := 0.00;
    v_desc_percent := 0.00;
  end if;

  v_total := round(v_subtotal - v_desconto, 2);
  v_repasse_total := round(p_quantidade * coalesce(v_venda.valor_repasse_unitario, v_item.preco_venda_sugerido, 0), 2);

  if v_total <= v_repasse_total then
    v_comissao := 0.00;
  else
    v_comissao := round(v_total * (v_venda.comissao_percentual / 100.0), 2);
  end if;
  v_loja := round(v_total - v_comissao, 2);

  -- 9. Atualizar o registro da venda existente (preservando o ID original)
  update public.revenda_vendas
  set quantidade = p_quantidade,
      preco_unitario_vendido = p_preco_unitario,
      subtotal_venda = v_subtotal,
      valor_total_bruto = v_subtotal,
      percentual_desconto = v_desc_percent,
      valor_desconto = v_desconto,
      total_venda = v_total,
      valor_comissao = v_comissao,
      valor_loja = v_loja,
      forma_pagamento = p_forma_pagamento,
      data_venda = coalesce(p_data_venda, v_venda.data_venda),
      observacao = p_observacao
  where id = p_venda_id;

  return jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Venda atualizada com sucesso.',
    'venda_id', p_venda_id,
    'quantidade', p_quantidade,
    'total_venda', v_total,
    'valor_desconto', v_desconto,
    'valor_comissao', v_comissao,
    'valor_loja', v_loja
  );
end;
$function$;

grant execute on function public.editar_venda_portal_revendedora(bigint, integer, numeric, numeric, text, timestamptz, text, numeric) to authenticated;
grant execute on function public.registrar_venda_portal_revendedora(bigint, integer, numeric, text, timestamptz, text, numeric, text, numeric) to authenticated;
