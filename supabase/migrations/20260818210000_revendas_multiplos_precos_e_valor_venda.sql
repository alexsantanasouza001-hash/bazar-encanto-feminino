-- ====================================================================
-- MIGRATION: MÓDULO REVENDAS — MÚLTIPLOS PREÇOS, VALOR DE REPASSE E VALOR DA VENDA
-- BAZAR ENCANTO FEMININO
-- ====================================================================

begin;

-- 1. ADICIONAR COLUNA HISTÓRICA DE VALOR DE REPASSE EM REVENDA_VENDAS
alter table public.revenda_vendas 
  add column if not exists valor_repasse_unitario numeric(10,2) not null default 0 check (valor_repasse_unitario >= 0);

-- Backfill de registros existentes caso a coluna tenha acabado de ser criada
update public.revenda_vendas v
set valor_repasse_unitario = coalesce(i.preco_venda_sugerido, v.preco_unitario_vendido, 0)
from public.revenda_remessa_itens i
where v.remessa_item_id = i.id
  and v.valor_repasse_unitario = 0;

-- 2. RPC ATUALIZADA: REGISTRAR VENDA CONSIGNADA INDIVIDUAL (COMPATIBILIDADE)
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

  -- Regra 2: Comissão calculada sobre o VALOR REAL DA VENDA
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
    'quantidade', p_quantidade,
    'valor_repasse_unitario', v_item.preco_venda_sugerido,
    'preco_unitario_vendido', p_preco_unitario,
    'valor_bruto', v_valor_bruto,
    'comissao', v_valor_comissao,
    'valor_loja', v_valor_loja
  );
end;
$function$;

-- 3. NOVA RPC ATÔMICA: REGISTRAR MÚLTIPLOS PREÇOS DE VENDA EM LOTE
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

  -- 2ª Gravação: insere cada grupo de venda preservando histórico exato
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
    'total_unidades', v_total_qtd,
    'total_bruto', v_total_bruto,
    'total_comissao', v_total_comissao,
    'total_loja', v_total_loja,
    'vendas', v_vendas_ids
  );
end;
$function$;

-- 4. PERMISSÕES DE EXECUÇÃO
revoke all privileges on function public.registrar_venda_consignada(bigint, integer, numeric, timestamptz, text) from public, anon;
revoke all privileges on function public.registrar_vendas_consignadas_lote(bigint, jsonb, timestamptz, text) from public, anon;

grant execute on function public.registrar_venda_consignada(bigint, integer, numeric, timestamptz, text) to authenticated, service_role;
grant execute on function public.registrar_vendas_consignadas_lote(bigint, jsonb, timestamptz, text) to authenticated, service_role;

commit;
