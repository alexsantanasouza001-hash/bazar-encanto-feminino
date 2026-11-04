-- ====================================================================
-- MIGRATION: NOVA METODOLOGIA DO PORTAL DE REVENDEDORAS
-- 1. Vendas nascem CONFIRMADAS com baixa atômica no estoque da remessa
-- 2. Edição e Cancelamento de venda antes de quitação financeira
-- 3. Fluxo de Pagamentos/Repasses com status AGUARDANDO_CONFIRMACAO,
--    CONFIRMADO e RECUSADO
-- 4. Separação definitiva entre evento comercial (venda) e financeiro (pagamento)
-- ====================================================================

-- 1. ADICIONAR COLUNAS EM revenda_pagamentos
alter table public.revenda_pagamentos
  add column if not exists status text not null default 'CONFIRMADO',
  add column if not exists valor_informado numeric(10,2),
  add column if not exists valor_confirmado numeric(10,2),
  add column if not exists confirmado_em timestamptz,
  add column if not exists confirmado_por uuid references auth.users(id),
  add column if not exists recusado_em timestamptz,
  add column if not exists recusado_por uuid references auth.users(id),
  add column if not exists motivo_recusa text,
  add column if not exists remessa_id bigint references public.revenda_remessas(id),
  add column if not exists idempotency_key text;

-- Atualizar registros legados (se existirem)
update public.revenda_pagamentos
set valor_informado = coalesce(valor_informado, valor),
    valor_confirmado = coalesce(valor_confirmado, valor),
    status = coalesce(status, 'CONFIRMADO')
where valor_informado is null or valor_confirmado is null;

-- Restrição de status de pagamento
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'revenda_pagamentos_status_check'
  ) then
    alter table public.revenda_pagamentos
      add constraint revenda_pagamentos_status_check
      check (status in ('AGUARDANDO_CONFIRMACAO', 'CONFIRMADO', 'RECUSADO'));
  end if;
end $$;

-- 2. RECRIAR RPC registrar_venda_portal_revendedora (VENDA NASCE CONFIRMADA COM BAIXA DE ESTOQUE)
drop function if exists public.registrar_venda_portal_revendedora(bigint, integer, numeric, text, timestamptz, text, numeric, text, numeric);
drop function if exists public.registrar_venda_portal_revendedora(bigint, integer, numeric, text, timestamptz, text, numeric, text);

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
  v_total_enviado integer;
  v_total_vendido integer;
  v_total_devolvido integer;
  v_novo_status_remessa text;
begin
  -- 1. Obter e validar revendedora autenticada
  v_revendedora_id := public.obter_minha_revendedora_id();
  if v_revendedora_id is null then
    raise exception 'Acesso negado: revendedora não autenticada ou sem acesso ativo' using errcode = '42501';
  end if;

  select * into v_revendedora from public.revendedoras where id = v_revendedora_id;
  if not found or v_revendedora.status_acesso != 'ATIVO' or v_revendedora.status != 'Ativa' then
    raise exception 'Acesso da revendedora bloqueado ou inativo' using errcode = '42501';
  end if;

  -- 2. Proteção de idempotência
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

  -- 4. Bloqueio transacional do item da remessa (FOR UPDATE para concorrência segura)
  select * into v_item from public.revenda_remessa_itens
  where id = p_remessa_item_id
  for update;

  if not found then
    raise exception 'Item da remessa não encontrado' using errcode = 'P0002';
  end if;

  -- 5. Validar se o item pertence de fato a uma remessa da revendedora
  select * into v_remessa from public.revenda_remessas where id = v_item.remessa_id;
  if not found or v_remessa.revendedora_id != v_revendedora_id then
    raise exception 'Este item não pertence às suas remessas' using errcode = '42501';
  end if;

  -- 6. Calcular saldo disponível na remessa
  v_saldo_disponivel := v_item.quantidade_enviada - v_item.quantidade_vendida - v_item.quantidade_devolvida;
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

  if v_total <= v_repasse_total then
    v_comissao := 0.00;
  else
    v_comissao := round(v_total * (v_item.comissao_percentual / 100.0), 2);
  end if;
  v_loja := round(v_total - v_comissao, 2);

  -- 8. BAIXA DE ESTOQUE DEFINITIVA IMEDIATA NA REMESSA
  update public.revenda_remessa_itens
  set quantidade_vendida = quantidade_vendida + p_quantidade,
      atualizado_em = now()
  where id = p_remessa_item_id;

  -- 9. INSERIR A VENDA DIRETAMENTE COMO CONFIRMADA
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
    confirmado_em,
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
    'CONFIRMADA',
    'PORTAL_REVENDEDORA',
    nullif(btrim(p_idempotency_key), ''),
    now(),
    now()
  ) returning id into v_venda_id;

  -- 10. Atualizar status da remessa
  select sum(quantidade_enviada), sum(quantidade_vendida), sum(quantidade_devolvida)
  into v_total_enviado, v_total_vendido, v_total_devolvido
  from public.revenda_remessa_itens
  where remessa_id = v_item.remessa_id;

  if (v_total_vendido + v_total_devolvido) >= v_total_enviado then
    v_novo_status_remessa := 'Acertada';
  else
    v_novo_status_remessa := 'Parcialmente vendida';
  end if;

  update public.revenda_remessas
  set status = v_novo_status_remessa,
      atualizado_em = now()
  where id = v_item.remessa_id;

  return jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Venda registrada e confirmada com sucesso.',
    'venda_id', v_venda_id,
    'status', 'CONFIRMADA'
  );
end;
$function$;

-- 3. RECRIAR RPC editar_venda_portal_revendedora
drop function if exists public.editar_venda_portal_revendedora(bigint, integer, numeric, numeric, text, timestamptz, text, numeric);
drop function if exists public.editar_venda_portal_revendedora(bigint, integer, numeric, text, timestamptz, text, numeric);

create or replace function public.editar_venda_portal_revendedora(
  p_venda_id bigint,
  p_quantidade integer,
  p_preco_unitario numeric,
  p_valor_desconto numeric default 0.00,
  p_forma_pagamento text default 'Pix',
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
  v_revendedora_id bigint;
  v_venda public.revenda_vendas%rowtype;
  v_item public.revenda_remessa_itens%rowtype;
  v_pagamento_confirmado_count integer;
  v_diff integer;
  v_saldo_disponivel integer;
  v_subtotal numeric(10,2);
  v_desconto numeric(10,2);
  v_desc_percent numeric(5,2);
  v_total numeric(10,2);
  v_repasse_total numeric(10,2);
  v_comissao numeric(10,2);
  v_loja numeric(10,2);
  v_total_enviado integer;
  v_total_vendido integer;
  v_total_devolvido integer;
  v_novo_status_remessa text;
begin
  -- 1. Obter e validar revendedora autenticada
  v_revendedora_id := public.obter_minha_revendedora_id();
  if v_revendedora_id is null then
    raise exception 'Acesso negado: revendedora não autenticada ou sem acesso ativo' using errcode = '42501';
  end if;

  -- 2. Bloqueio da venda
  select * into v_venda from public.revenda_vendas
  where id = p_venda_id
  for update;

  if not found then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;

  if v_venda.revendedora_id != v_revendedora_id then
    raise exception 'Você só pode editar vendas da sua própria conta' using errcode = '42501';
  end if;

  if v_venda.status != 'CONFIRMADA' then
    raise exception 'Apenas vendas confirmadas podem ser editadas (status atual: %)', v_venda.status using errcode = '22023';
  end if;

  -- 3. Verificar se há pagamento confirmado vinculado à remessa dessa venda
  select count(*) into v_pagamento_confirmado_count
  from public.revenda_pagamentos
  where revendedora_id = v_revendedora_id
    and status = 'CONFIRMADO'
    and remessa_id = v_venda.remessa_id;

  if v_pagamento_confirmado_count > 0 then
    raise exception 'Esta venda não pode ser editada diretamente porque já possui pagamento confirmado na remessa. Solicite auxílio à administração.' using errcode = '22023';
  end if;

  -- 4. Validações de quantidade e preço
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade deve ser maior que zero' using errcode = '22023';
  end if;

  if p_preco_unitario is null or p_preco_unitario <= 0 then
    raise exception 'O preço unitário deve ser maior que zero' using errcode = '22023';
  end if;

  -- 5. Bloqueio do item da remessa
  select * into v_item from public.revenda_remessa_itens
  where id = v_venda.remessa_item_id
  for update;

  if not found then
    raise exception 'Item da remessa não encontrado' using errcode = 'P0002';
  end if;

  -- 6. Ajuste atômico do estoque
  v_diff := p_quantidade - v_venda.quantidade;
  if v_diff > 0 then
    -- Necessita de mais unidades da remessa
    v_saldo_disponivel := v_item.quantidade_enviada - v_item.quantidade_vendida - v_item.quantidade_devolvida;
    if v_saldo_disponivel < v_diff then
      raise exception 'Estoque insuficiente para aumentar a quantidade. Disponível: % un.', v_saldo_disponivel using errcode = 'P0001';
    end if;
    update public.revenda_remessa_itens
    set quantidade_vendida = quantidade_vendida + v_diff,
        atualizado_em = now()
    where id = v_item.id;
  elsif v_diff < 0 then
    -- Devolve unidades vendidas ao saldo disponível
    update public.revenda_remessa_itens
    set quantidade_vendida = greatest(0, quantidade_vendida - abs(v_diff)),
        atualizado_em = now()
    where id = v_item.id;
  end if;

  -- 7. Recálculo financeiro
  v_subtotal := round(p_quantidade * p_preco_unitario, 2);
  v_desconto := round(coalesce(p_valor_desconto, 0.00), 2);
  if v_desconto < 0 or v_desconto > v_subtotal then
    raise exception 'Desconto não pode ser negativo ou maior que o valor da venda' using errcode = '22023';
  end if;

  if v_subtotal > 0 and v_desconto > 0 then
    v_desc_percent := round((v_desconto / v_subtotal) * 100.0, 2);
  else
    v_desc_percent := coalesce(p_percentual_desconto, 0.00);
  end if;

  v_total := round(v_subtotal - v_desconto, 2);
  v_repasse_total := round(p_quantidade * coalesce(v_venda.valor_repasse_unitario, v_item.preco_venda_sugerido, 0), 2);

  if v_total <= v_repasse_total then
    v_comissao := 0.00;
  else
    v_comissao := round(v_total * (v_venda.comissao_percentual / 100.0), 2);
  end if;
  v_loja := round(v_total - v_comissao, 2);

  -- 8. Atualizar registro da venda
  update public.revenda_vendas
  set quantidade = p_quantidade,
      preco_unitario_vendido = p_preco_unitario,
      subtotal_venda = v_subtotal,
      valor_desconto = v_desconto,
      percentual_desconto = v_desc_percent,
      total_venda = v_total,
      valor_total_bruto = v_subtotal,
      valor_comissao = v_comissao,
      valor_loja = v_loja,
      forma_pagamento = coalesce(p_forma_pagamento, forma_pagamento),
      data_venda = coalesce(p_data_venda, data_venda),
      observacao = p_observacao
  where id = p_venda_id;

  -- 9. Atualizar status da remessa
  select sum(quantidade_enviada), sum(quantidade_vendida), sum(quantidade_devolvida)
  into v_total_enviado, v_total_vendido, v_total_devolvido
  from public.revenda_remessa_itens
  where remessa_id = v_item.remessa_id;

  if (v_total_vendido + v_total_devolvido) >= v_total_enviado then
    v_novo_status_remessa := 'Acertada';
  elsif v_total_vendido > 0 then
    v_novo_status_remessa := 'Parcialmente vendida';
  else
    v_novo_status_remessa := 'Enviada';
  end if;

  update public.revenda_remessas
  set status = v_novo_status_remessa,
      atualizado_em = now()
  where id = v_item.remessa_id;

  return jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Venda atualizada com sucesso.',
    'venda_id', p_venda_id
  );
end;
$function$;

-- 4. CRIAR RPC cancelar_venda_portal_revendedora
drop function if exists public.cancelar_venda_portal_revendedora(bigint, text);

create or replace function public.cancelar_venda_portal_revendedora(
  p_venda_id bigint,
  p_motivo text default null
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
  v_pagamento_confirmado_count integer;
  v_total_enviado integer;
  v_total_vendido integer;
  v_total_devolvido integer;
  v_novo_status_remessa text;
begin
  -- 1. Obter e validar revendedora autenticada
  v_revendedora_id := public.obter_minha_revendedora_id();
  if v_revendedora_id is null then
    raise exception 'Acesso negado: revendedora não autenticada' using errcode = '42501';
  end if;

  -- 2. Bloqueio da venda
  select * into v_venda from public.revenda_vendas
  where id = p_venda_id
  for update;

  if not found then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;

  if v_venda.revendedora_id != v_revendedora_id then
    raise exception 'Você só pode cancelar vendas da sua própria conta' using errcode = '42501';
  end if;

  if v_venda.status = 'CANCELADA' then
    return jsonb_build_object('sucesso', true, 'mensagem', 'Esta venda já está cancelada.');
  end if;

  if v_venda.status != 'CONFIRMADA' and v_venda.status != 'AGUARDANDO_CONFERENCIA' then
    raise exception 'Esta venda não pode ser cancelada (status: %)', v_venda.status using errcode = '22023';
  end if;

  -- 3. Verificar se há pagamento confirmado na remessa
  select count(*) into v_pagamento_confirmado_count
  from public.revenda_pagamentos
  where revendedora_id = v_revendedora_id
    and status = 'CONFIRMADO'
    and remessa_id = v_venda.remessa_id;

  if v_pagamento_confirmado_count > 0 then
    raise exception 'Não é possível cancelar diretamente esta venda porque a remessa já possui pagamentos confirmados. Procure a administração.' using errcode = '22023';
  end if;

  -- 4. Devolver estoque à remessa
  select * into v_item from public.revenda_remessa_itens
  where id = v_venda.remessa_item_id
  for update;

  if found then
    if v_venda.status = 'CONFIRMADA' then
      update public.revenda_remessa_itens
      set quantidade_vendida = greatest(0, quantidade_vendida - v_venda.quantidade),
          atualizado_em = now()
      where id = v_item.id;
    elsif v_venda.status = 'AGUARDANDO_CONFERENCIA' then
      update public.revenda_remessa_itens
      set quantidade_reservada = greatest(0, coalesce(quantidade_reservada, 0) - v_venda.quantidade),
          atualizado_em = now()
      where id = v_item.id;
    end if;
  end if;

  -- 5. Atualizar venda para CANCELADA
  update public.revenda_vendas
  set status = 'CANCELADA',
      observacao = coalesce(observacao, '') || case when p_motivo is not null then ' [Cancelada: ' || p_motivo || ']' else ' [Cancelada pela revendedora]' end
  where id = p_venda_id;

  -- 6. Atualizar status da remessa
  if v_item.remessa_id is not null then
    select sum(quantidade_enviada), sum(quantidade_vendida), sum(quantidade_devolvida)
    into v_total_enviado, v_total_vendido, v_total_devolvido
    from public.revenda_remessa_itens
    where remessa_id = v_item.remessa_id;

    if (v_total_vendido + v_total_devolvido) >= v_total_enviado then
      v_novo_status_remessa := 'Acertada';
    elsif v_total_vendido > 0 then
      v_novo_status_remessa := 'Parcialmente vendida';
    else
      v_novo_status_remessa := 'Enviada';
    end if;

    update public.revenda_remessas
    set status = v_novo_status_remessa,
        atualizado_em = now()
    where id = v_item.remessa_id;
  end if;

  return jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Venda cancelada com sucesso e estoque restaurado.'
  );
end;
$function$;

-- 5. CRIAR RPC informar_pagamento_portal_revendedora
drop function if exists public.informar_pagamento_portal_revendedora(numeric, timestamptz, text, bigint, text, text, text);

create or replace function public.informar_pagamento_portal_revendedora(
  p_valor numeric,
  p_data_pagamento timestamptz default now(),
  p_forma_pagamento text default 'Pix',
  p_remessa_id bigint default null,
  p_observacao text default null,
  p_comprovante_ref text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_revendedora_id bigint;
  v_pagamento_id bigint;
  v_pagamento_existente public.revenda_pagamentos%rowtype;
begin
  -- 1. Obter e validar revendedora logada
  v_revendedora_id := public.obter_minha_revendedora_id();
  if v_revendedora_id is null then
    raise exception 'Acesso negado: revendedora não autenticada' using errcode = '42501';
  end if;

  -- 2. Idempotência
  if p_idempotency_key is not null and btrim(p_idempotency_key) != '' then
    select * into v_pagamento_existente from public.revenda_pagamentos
    where idempotency_key = btrim(p_idempotency_key);
    if found then
      return jsonb_build_object(
        'sucesso', true,
        'mensagem', 'Pagamento já informado anteriormente.',
        'pagamento_id', v_pagamento_existente.id,
        'status', v_pagamento_existente.status,
        'duplicado', true
      );
    end if;
  end if;

  -- 3. Validação do valor
  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor do pagamento deve ser maior que zero' using errcode = '22023';
  end if;

  -- 4. Inserir pagamento com status AGUARDANDO_CONFIRMACAO
  insert into public.revenda_pagamentos (
    revendedora_id,
    remessa_id,
    valor,
    valor_informado,
    valor_confirmado,
    forma_pagamento,
    data_pagamento,
    status,
    observacao,
    comprovante_ref,
    idempotency_key,
    criado_em
  ) values (
    v_revendedora_id,
    p_remessa_id,
    p_valor,
    p_valor,
    null,
    coalesce(p_forma_pagamento, 'Pix'),
    coalesce(p_data_pagamento, now()),
    'AGUARDANDO_CONFIRMACAO',
    p_observacao,
    p_comprovante_ref,
    nullif(btrim(p_idempotency_key), ''),
    now()
  ) returning id into v_pagamento_id;

  return jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Pagamento informado com sucesso. Aguardando confirmação da administração.',
    'pagamento_id', v_pagamento_id,
    'status', 'AGUARDANDO_CONFIRMACAO'
  );
end;
$function$;

-- 6. CRIAR RPC confirmar_pagamento_revendedora_admin
drop function if exists public.confirmar_pagamento_revendedora_admin(bigint, numeric, text);

create or replace function public.confirmar_pagamento_revendedora_admin(
  p_pagamento_id bigint,
  p_valor_confirmado numeric default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pagamento public.revenda_pagamentos%rowtype;
  v_valor_final numeric(10,2);
begin
  -- Exigir perfil de Administrador ou Sócio
  if not public.e_admin_ou_socio() then
    raise exception 'Acesso restrito a administradores e sócios' using errcode = '42501';
  end if;

  -- Bloqueio do pagamento
  select * into v_pagamento from public.revenda_pagamentos
  where id = p_pagamento_id
  for update;

  if not found then
    raise exception 'Pagamento não encontrado' using errcode = 'P0002';
  end if;

  if v_pagamento.status = 'CONFIRMADO' then
    return jsonb_build_object('sucesso', true, 'mensagem', 'Pagamento já confirmado anteriormente.', 'duplicado', true);
  end if;

  v_valor_final := coalesce(p_valor_confirmado, v_pagamento.valor_informado, v_pagamento.valor);
  if v_valor_final <= 0 then
    raise exception 'O valor confirmado deve ser maior que zero' using errcode = '22023';
  end if;

  update public.revenda_pagamentos
  set status = 'CONFIRMADO',
      valor = v_valor_final,
      valor_confirmado = v_valor_final,
      confirmado_em = now(),
      confirmado_por = auth.uid(),
      observacao = coalesce(p_observacao, observacao)
  where id = p_pagamento_id;

  return jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Pagamento confirmado com sucesso.',
    'pagamento_id', p_pagamento_id,
    'valor_confirmado', v_valor_final
  );
end;
$function$;

-- 7. CRIAR RPC recusar_pagamento_revendedora_admin
drop function if exists public.recusar_pagamento_revendedora_admin(bigint, text);

create or replace function public.recusar_pagamento_revendedora_admin(
  p_pagamento_id bigint,
  p_motivo_recusa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pagamento public.revenda_pagamentos%rowtype;
begin
  -- Exigir perfil de Administrador ou Sócio
  if not public.e_admin_ou_socio() then
    raise exception 'Acesso restrito a administradores e sócios' using errcode = '42501';
  end if;

  if p_motivo_recusa is null or btrim(p_motivo_recusa) = '' then
    raise exception 'É obrigatório informar o motivo da recusa do pagamento' using errcode = '22023';
  end if;

  select * into v_pagamento from public.revenda_pagamentos
  where id = p_pagamento_id
  for update;

  if not found then
    raise exception 'Pagamento não encontrado' using errcode = 'P0002';
  end if;

  if v_pagamento.status = 'CONFIRMADO' then
    raise exception 'Um pagamento já confirmado não pode ser recusado diretamente.' using errcode = '22023';
  end if;

  update public.revenda_pagamentos
  set status = 'RECUSADO',
      recusado_em = now(),
      recusado_por = auth.uid(),
      motivo_recusa = btrim(p_motivo_recusa)
  where id = p_pagamento_id;

  return jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Pagamento recusado.',
    'pagamento_id', p_pagamento_id
  );
end;
$function$;

-- 8. PERMISSÕES E GRANTS ESPECÍFICOS
grant execute on function public.registrar_venda_portal_revendedora(bigint, integer, numeric, text, timestamptz, text, numeric, text, numeric) to authenticated, service_role;
grant execute on function public.editar_venda_portal_revendedora(bigint, integer, numeric, numeric, text, timestamptz, text, numeric) to authenticated, service_role;
grant execute on function public.cancelar_venda_portal_revendedora(bigint, text) to authenticated, service_role;
grant execute on function public.informar_pagamento_portal_revendedora(numeric, timestamptz, text, bigint, text, text, text) to authenticated, service_role;
grant execute on function public.confirmar_pagamento_revendedora_admin(bigint, numeric, text) to authenticated, service_role;
grant execute on function public.recusar_pagamento_revendedora_admin(bigint, text) to authenticated, service_role;
