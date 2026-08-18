-- ====================================================================
-- MIGRATION: CONSISTÊNCIA DE PERMISSÕES — MÓDULO REVENDAS PARA ADMIN E SÓCIO
-- BAZAR ENCANTO FEMININO
-- ====================================================================

begin;

-- 1. RPC: CRIAR REMESSA COM BAIXA ATÔMICA (PERMITIR ADMIN E SÓCIO)
create or replace function public.criar_remessa_consignacao(
  p_revendedora_id bigint,
  p_itens jsonb,
  p_observacao text default null,
  p_responsavel text default null
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
  v_preco numeric(10,2);
  v_custo numeric(10,2);
  v_comissao numeric(5,2);
  v_produto_nome text;
  v_sku text;
  v_estoque_atual integer;
  v_tamanho_estoque integer;
  v_total_pecas integer := 0;
  v_total_valor numeric(12,2) := 0;
begin
  -- Exigir perfil de Administrador ou Sócio ativo
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
    total_valor_enviado
  ) values (
    v_numero,
    p_revendedora_id,
    now(),
    v_revendedora.comissao_padrao,
    'Enviada',
    p_observacao,
    p_responsavel,
    0,
    0
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
    v_preco := coalesce((v_item->>'preco_venda_sugerido')::numeric, 0);
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
      where id = v_tamanho_id
      for update;

      if not found or v_tamanho_estoque < v_quantidade then
        raise exception 'Estoque insuficiente para tamanho % do produto % (Disponível: %, Solicitado: %)',
          v_tamanho, v_produto_nome, coalesce(v_tamanho_estoque, 0), v_quantidade using errcode = 'P0001';
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
      produto_tamanho_id,
      variacao_id,
      produto_nome,
      sku,
      tamanho,
      cor,
      cor_hex,
      quantidade_enviada,
      preco_venda_sugerido,
      custo_unitario,
      comissao_percentual
    ) values (
      v_remessa_id,
      v_produto_id,
      v_tamanho_id,
      v_variacao_id,
      v_produto_nome,
      v_sku,
      v_tamanho,
      v_cor,
      v_cor_hex,
      v_quantidade,
      v_preco,
      coalesce(v_custo, 0),
      v_comissao
    );

    insert into public.movimentacoes (
      produto_id,
      produto_nome,
      tipo,
      quantidade,
      estoque_anterior,
      estoque_atual,
      observacao,
      data
    ) values (
      v_produto_id,
      v_produto_nome || coalesce(' (' || v_tamanho || ')', ''),
      'saida',
      v_quantidade,
      v_estoque_atual,
      v_estoque_atual - v_quantidade,
      'Envio em consignação: ' || v_numero || ' para ' || v_revendedora.nome,
      now()
    );

    v_total_pecas := v_total_pecas + v_quantidade;
    v_total_valor := v_total_valor + (v_quantidade * v_preco);
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
    'total_valor', v_total_valor
  );
end;
$function$;

-- 2. RPC: REGISTRAR VENDA CONSIGNADA (PERMITIR ADMIN E SÓCIO)
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

  if p_quantidade <= 0 or p_preco_unitario < 0 then
    raise exception 'Quantidade ou preço de venda inválidos' using errcode = '22023';
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
    revendedora_id,
    produto_id,
    produto_tamanho_id,
    variacao_id,
    produto_nome,
    tamanho,
    cor,
    cor_hex,
    quantidade,
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
    v_remessa.revendedora_id,
    v_item.produto_id,
    v_item.produto_tamanho_id,
    v_item.variacao_id,
    v_item.produto_nome,
    v_item.tamanho,
    v_item.cor,
    v_item.cor_hex,
    p_quantidade,
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
    'quantidade', p_quantidade,
    'valor_bruto', v_valor_bruto,
    'comissao', v_valor_comissao,
    'valor_loja', v_valor_loja
  );
end;
$function$;

-- 3. RPC: REGISTRAR DEVOLUÇÃO CONSIGNADA (PERMITIR ADMIN E SÓCIO)
create or replace function public.registrar_devolucao_consignada(
  p_remessa_item_id bigint,
  p_quantidade integer,
  p_motivo text default null
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
  v_devolucao_id bigint;
  v_estoque_anterior integer;
  v_total_enviado integer;
  v_total_vendido integer;
  v_total_devolvido integer;
  v_novo_status text;
begin
  -- Exigir perfil de Administrador ou Sócio ativo
  if not public.e_admin_ou_socio() then
    raise exception 'Acesso restrito a administradores e sócios' using errcode = '42501';
  end if;

  if p_quantidade <= 0 then
    raise exception 'Quantidade de devolução inválida' using errcode = '22023';
  end if;

  select * into v_item from public.revenda_remessa_itens where id = p_remessa_item_id for update;
  if not found then
    raise exception 'Item da remessa não encontrado' using errcode = 'P0002';
  end if;

  select * into v_remessa from public.revenda_remessas where id = v_item.remessa_id;
  select * into v_revendedora from public.revendedoras where id = v_remessa.revendedora_id;

  v_saldo_consignado := v_item.quantidade_enviada - v_item.quantidade_vendida - v_item.quantidade_devolvida;
  if v_saldo_consignado < p_quantidade then
    raise exception 'Quantidade de devolução (%) maior que o saldo consignado (%)',
      p_quantidade, v_saldo_consignado using errcode = 'P0001';
  end if;

  update public.revenda_remessa_itens
  set quantidade_devolvida = quantidade_devolvida + p_quantidade,
      atualizado_em = now()
  where id = p_remessa_item_id;

  select quantidade into v_estoque_anterior
  from public.produtos
  where id = v_item.produto_id
  for update;

  update public.produtos
  set quantidade = quantidade + p_quantidade
  where id = v_item.produto_id;

  if v_item.produto_tamanho_id is not null then
    update public.produto_tamanhos
    set quantidade = quantidade + p_quantidade
    where id = v_item.produto_tamanho_id;
  end if;

  insert into public.revenda_devolucoes (
    remessa_item_id,
    remessa_id,
    revendedora_id,
    produto_id,
    produto_tamanho_id,
    variacao_id,
    cor,
    cor_hex,
    quantidade,
    motivo,
    data_devolucao
  ) values (
    p_remessa_item_id,
    v_item.remessa_id,
    v_remessa.revendedora_id,
    v_item.produto_id,
    v_item.produto_tamanho_id,
    v_item.variacao_id,
    v_item.cor,
    v_item.cor_hex,
    p_quantidade,
    p_motivo,
    now()
  ) returning id into v_devolucao_id;

  insert into public.movimentacoes (
    produto_id,
    produto_nome,
    tipo,
    quantidade,
    estoque_anterior,
    estoque_atual,
    observacao,
    data
  ) values (
    v_item.produto_id,
    v_item.produto_nome || coalesce(' (' || v_item.tamanho || ')', ''),
    'entrada',
    p_quantidade,
    v_estoque_anterior,
    v_estoque_anterior + p_quantidade,
    'Devolução de consignação da remessa ' || v_remessa.numero || ' de ' || v_revendedora.nome || coalesce(' - Motivo: ' || p_motivo, ''),
    now()
  );

  select sum(quantidade_enviada), sum(quantidade_vendida), sum(quantidade_devolvida)
  into v_total_enviado, v_total_vendido, v_total_devolvido
  from public.revenda_remessa_itens
  where remessa_id = v_item.remessa_id;

  if (v_total_vendido + v_total_devolvido) >= v_total_enviado then
    v_novo_status := 'Encerrada';
  else
    v_novo_status := 'Parcialmente devolvida';
  end if;

  update public.revenda_remessas
  set status = v_novo_status,
      atualizado_em = now()
  where id = v_item.remessa_id;

  return jsonb_build_object(
    'sucesso', true,
    'devolucao_id', v_devolucao_id,
    'quantidade', p_quantidade,
    'estoque_loja_atual', v_estoque_anterior + p_quantidade
  );
end;
$function$;

-- 4. RPC: REGISTRAR PAGAMENTO DE ACERTO (PERMITIR ADMIN E SÓCIO)
create or replace function public.registrar_pagamento_acerto(
  p_revendedora_id bigint,
  p_valor numeric,
  p_forma_pagamento text,
  p_acerto_id bigint default null,
  p_data_pagamento timestamptz default now(),
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pagamento_id bigint;
  v_acerto public.revenda_acertos%rowtype;
  v_novo_pago numeric(10,2);
  v_novo_saldo numeric(10,2);
  v_novo_status text;
begin
  -- Exigir perfil de Administrador ou Sócio ativo
  if not public.e_admin_ou_socio() then
    raise exception 'Acesso restrito a administradores e sócios' using errcode = '42501';
  end if;

  if p_valor <= 0 then
    raise exception 'Valor de pagamento deve ser maior que zero' using errcode = '22023';
  end if;

  if p_forma_pagamento not in ('Pix', 'Transferência', 'Dinheiro', 'Cartão', 'Outro') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023';
  end if;

  insert into public.revenda_pagamentos (
    revendedora_id,
    acerto_id,
    valor,
    forma_pagamento,
    data_pagamento,
    observacao
  ) values (
    p_revendedora_id,
    p_acerto_id,
    p_valor,
    p_forma_pagamento,
    coalesce(p_data_pagamento, now()),
    p_observacao
  ) returning id into v_pagamento_id;

  if p_acerto_id is not null then
    select * into v_acerto from public.revenda_acertos where id = p_acerto_id for update;
    if found then
      v_novo_pago := v_acerto.total_pago + p_valor;
      v_novo_saldo := greatest(0, v_acerto.total_devido_loja - v_novo_pago);
      if v_novo_saldo = 0 then
        v_novo_status := 'Pago';
      else
        v_novo_status := 'Parcial';
      end if;

      update public.revenda_acertos
      set total_pago = v_novo_pago,
          saldo_pendente = v_novo_saldo,
          status = v_novo_status,
          atualizado_em = now()
      where id = p_acerto_id;
    end if;
  end if;

  return jsonb_build_object(
    'sucesso', true,
    'pagamento_id', v_pagamento_id,
    'valor', p_valor
  );
end;
$function$;

-- Privilégios de execução
revoke all privileges on function public.criar_remessa_consignacao(bigint, jsonb, text, text) from public, anon;
revoke all privileges on function public.registrar_venda_consignada(bigint, integer, numeric, timestamptz, text) from public, anon;
revoke all privileges on function public.registrar_devolucao_consignada(bigint, integer, text) from public, anon;
revoke all privileges on function public.registrar_pagamento_acerto(bigint, numeric, text, bigint, timestamptz, text) from public, anon;

grant execute on function public.criar_remessa_consignacao(bigint, jsonb, text, text) to authenticated, service_role;
grant execute on function public.registrar_venda_consignada(bigint, integer, numeric, timestamptz, text) to authenticated, service_role;
grant execute on function public.registrar_devolucao_consignada(bigint, integer, text) to authenticated, service_role;
grant execute on function public.registrar_pagamento_acerto(bigint, numeric, text, bigint, timestamptz, text) to authenticated, service_role;

commit;
