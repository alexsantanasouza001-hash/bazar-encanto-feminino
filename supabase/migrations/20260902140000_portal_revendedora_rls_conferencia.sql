-- ====================================================================
-- MIGRATION: PORTAL DA REVENDEDORA — RLS, CONFERÊNCIA E RESERVA DE ESTOQUE
-- BAZAR ENCANTO FEMININO
-- 100% ADITIVA E RETROCOMPATÍVEL COM REMESSAS EXISTENTES
-- ====================================================================

begin;

-- 1. ADICIONAR CAMPOS DE AUTENTICAÇÃO E STATUS À TABELA REVENDEDORAS
alter table public.revendedoras
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists status_acesso text not null default 'SEM_ACESSO'
    check (status_acesso in ('SEM_ACESSO', 'ATIVO', 'BLOQUEADO'));

create index if not exists revendedoras_auth_user_id_idx on public.revendedoras(auth_user_id);

-- 2. ADICIONAR CAMPO DE RESERVA LOGICA DE ESTOQUE EM ITENS DE REMESSA
alter table public.revenda_remessa_itens
  add column if not exists quantidade_reservada integer not null default 0
    check (quantidade_reservada >= 0);

-- 3. ADICIONAR CAMPOS DE STATUS, AUDITORIA, PAGAMENTO E IDEMPOTÊNCIA EM REVENDAS_VENDAS
alter table public.revenda_vendas
  add column if not exists status text not null default 'CONFIRMADA'
    check (status in ('AGUARDANDO_CONFERENCIA', 'CONFIRMADA', 'RECUSADA', 'CANCELADA')),
  add column if not exists origem text not null default 'ADMIN'
    check (origem in ('ADMIN', 'PORTAL_REVENDEDORA')),
  add column if not exists forma_pagamento text
    check (forma_pagamento in ('Pix', 'Dinheiro', 'Cartão', 'Transferência', 'Outro') or forma_pagamento is null),
  add column if not exists confirmado_em timestamptz,
  add column if not exists confirmado_por uuid references auth.users(id),
  add column if not exists recusado_em timestamptz,
  add column if not exists recusado_por uuid references auth.users(id),
  add column if not exists motivo_recusa text,
  add column if not exists idempotency_key text unique;

create index if not exists revenda_vendas_status_idx on public.revenda_vendas(status);
create index if not exists revenda_vendas_revendedora_status_idx on public.revenda_vendas(revendedora_id, status);

-- 4. FUNÇÃO AUXILIAR DE SEGURANÇA: IDENTIFICAR REVENDEDORA DO USUÁRIO LOGADO
create or replace function public.obter_minha_revendedora_id()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.revendedoras
  where auth_user_id = auth.uid()
    and status_acesso = 'ATIVO'
    and status = 'Ativa'
  limit 1;
$$;

grant execute on function public.obter_minha_revendedora_id() to anon, authenticated, service_role;

-- 5. ATUALIZAR POLÍTICAS RLS COM ISOLAMENTO ESTRITO POR REVENDEDORA
-- Habilitar RLS em todas as tabelas (já habilitado, garantindo idempotência)
alter table public.revendedoras enable row level security;
alter table public.revenda_remessas enable row level security;
alter table public.revenda_remessa_itens enable row level security;
alter table public.revenda_vendas enable row level security;
alter table public.revenda_acertos enable row level security;
alter table public.revenda_pagamentos enable row level security;
alter table public.revenda_devolucoes enable row level security;

-- A) REVENDEDORAS
drop policy if exists revendedoras_admin_all on public.revendedoras;
drop policy if exists revendedoras_portal_select on public.revendedoras;

create policy revendedoras_admin_all on public.revendedoras
  for all to authenticated
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

create policy revendedoras_portal_select on public.revendedoras
  for select to authenticated
  using (id = public.obter_minha_revendedora_id());

-- B) REVENDA_REMESSAS
drop policy if exists revenda_remessas_admin_all on public.revenda_remessas;
drop policy if exists revenda_remessas_portal_select on public.revenda_remessas;

create policy revenda_remessas_admin_all on public.revenda_remessas
  for all to authenticated
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

create policy revenda_remessas_portal_select on public.revenda_remessas
  for select to authenticated
  using (revendedora_id = public.obter_minha_revendedora_id());

-- C) REVENDA_REMESSA_ITENS
drop policy if exists revenda_remessa_itens_admin_all on public.revenda_remessa_itens;
drop policy if exists revenda_remessa_itens_portal_select on public.revenda_remessa_itens;

create policy revenda_remessa_itens_admin_all on public.revenda_remessa_itens
  for all to authenticated
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

create policy revenda_remessa_itens_portal_select on public.revenda_remessa_itens
  for select to authenticated
  using (remessa_id in (
    select id from public.revenda_remessas
    where revendedora_id = public.obter_minha_revendedora_id()
  ));

-- D) REVENDA_VENDAS
drop policy if exists revenda_vendas_admin_all on public.revenda_vendas;
drop policy if exists revenda_vendas_portal_select on public.revenda_vendas;

create policy revenda_vendas_admin_all on public.revenda_vendas
  for all to authenticated
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

create policy revenda_vendas_portal_select on public.revenda_vendas
  for select to authenticated
  using (revendedora_id = public.obter_minha_revendedora_id());

-- E) REVENDA_ACERTOS
drop policy if exists revenda_acertos_admin_all on public.revenda_acertos;
drop policy if exists revenda_acertos_portal_select on public.revenda_acertos;

create policy revenda_acertos_admin_all on public.revenda_acertos
  for all to authenticated
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

create policy revenda_acertos_portal_select on public.revenda_acertos
  for select to authenticated
  using (revendedora_id = public.obter_minha_revendedora_id());

-- F) REVENDA_PAGAMENTOS
drop policy if exists revenda_pagamentos_admin_all on public.revenda_pagamentos;
drop policy if exists revenda_pagamentos_portal_select on public.revenda_pagamentos;

create policy revenda_pagamentos_admin_all on public.revenda_pagamentos
  for all to authenticated
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

create policy revenda_pagamentos_portal_select on public.revenda_pagamentos
  for select to authenticated
  using (revendedora_id = public.obter_minha_revendedora_id());

-- G) REVENDA_DEVOLUCOES
drop policy if exists revenda_devolucoes_admin_all on public.revenda_devolucoes;
drop policy if exists revenda_devolucoes_portal_select on public.revenda_devolucoes;

create policy revenda_devolucoes_admin_all on public.revenda_devolucoes
  for all to authenticated
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

create policy revenda_devolucoes_portal_select on public.revenda_devolucoes
  for select to authenticated
  using (revendedora_id = public.obter_minha_revendedora_id());


-- 6. RPC: REGISTRAR VENDA PELO PORTAL DA REVENDEDORA (RESERVA ATÔMICA & IDEMPOTÊNCIA)
create or replace function public.registrar_venda_portal_revendedora(
  p_remessa_item_id bigint,
  p_quantidade integer,
  p_preco_unitario numeric,
  p_forma_pagamento text default 'Pix',
  p_data_venda timestamptz default now(),
  p_observacao text default null,
  p_percentual_desconto numeric default 0.00,
  p_idempotency_key text default null
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

  v_desc_percent := coalesce(p_percentual_desconto, 0.00);
  if v_desc_percent < 0 or v_desc_percent > 100 then
    raise exception 'Percentual de desconto inválido' using errcode = '22023';
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
  v_desconto := round(v_subtotal * (v_desc_percent / 100.0), 2);
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
  ) returning id into v_venda_id;

  return jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Venda registrada com sucesso. Informe ao Bazar para realizar a conferência.',
    'venda_id', v_venda_id,
    'numero_remessa', v_remessa.numero,
    'produto_nome', v_item.produto_nome,
    'quantidade', p_quantidade,
    'preco_unitario', p_preco_unitario,
    'total_venda', v_total,
    'comissao', v_comissao,
    'valor_loja', v_loja,
    'status', 'AGUARDANDO_CONFERENCIA'
  );
end;
$function$;


-- 7. RPC: ADMIN CONFIRMAR VENDA (BAIXA DEFINITIVA E LIBERAÇÃO DA RESERVA)
create or replace function public.confirmar_venda_revendedora(
  p_venda_id bigint,
  p_quantidade integer default null,
  p_preco_unitario numeric default null,
  p_data_venda timestamptz default null,
  p_forma_pagamento text default null,
  p_observacao text default null,
  p_percentual_desconto numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_venda public.revenda_vendas%rowtype;
  v_item public.revenda_remessa_itens%rowtype;
  v_remessa public.revenda_remessas%rowtype;
  v_qtd_final integer;
  v_preco_final numeric(10,2);
  v_desc_percent numeric(5,2);
  v_subtotal numeric(10,2);
  v_desconto numeric(10,2);
  v_total numeric(10,2);
  v_repasse_total numeric(10,2);
  v_comissao numeric(10,2);
  v_loja numeric(10,2);
  v_saldo_disponivel integer;
  v_total_enviado integer;
  v_total_vendido integer;
  v_total_devolvido integer;
  v_novo_status_remessa text;
begin
  -- Exigir perfil de Administrador ou Sócio
  if not public.e_admin_ou_socio() then
    raise exception 'Acesso restrito a administradores e sócios' using errcode = '42501';
  end if;

  -- 1. Bloqueio da venda
  select * into v_venda from public.revenda_vendas
  where id = p_venda_id
  for update;

  if not found then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;

  if v_venda.status != 'AGUARDANDO_CONFERENCIA' then
    raise exception 'Esta venda não está aguardando conferência (status atual: %)', v_venda.status using errcode = '22023';
  end if;

  -- 2. Bloqueio do item da remessa
  select * into v_item from public.revenda_remessa_itens
  where id = v_venda.remessa_item_id
  for update;

  if not found then
    raise exception 'Item da remessa não encontrado' using errcode = 'P0002';
  end if;

  -- 3. Definir dados finais (permitindo correções administrativas)
  v_qtd_final := coalesce(p_quantidade, v_venda.quantidade);
  v_preco_final := coalesce(p_preco_unitario, v_venda.preco_unitario_vendido);
  v_desc_percent := coalesce(p_percentual_desconto, v_venda.percentual_desconto, 0.00);

  if v_qtd_final <= 0 or v_preco_final <= 0 then
    raise exception 'Quantidade e preço final devem ser maiores que zero' using errcode = '22023';
  end if;

  -- Se quantidade for corrigida para mais, verificar se há saldo suficiente
  if v_qtd_final > v_venda.quantidade then
    v_saldo_disponivel := v_item.quantidade_enviada - v_item.quantidade_vendida - v_item.quantidade_devolvida - coalesce(v_item.quantidade_reservada, 0);
    if v_saldo_disponivel < (v_qtd_final - v_venda.quantidade) then
      raise exception 'Saldo insuficiente na remessa para aumentar a quantidade' using errcode = 'P0001';
    end if;
  end if;

  -- 4. Recalcular valores financeiros com regras oficiais
  v_subtotal := round(v_qtd_final * v_preco_final, 2);
  v_desconto := round(v_subtotal * (v_desc_percent / 100.0), 2);
  v_total := round(v_subtotal - v_desconto, 2);
  v_repasse_total := round(v_qtd_final * coalesce(v_item.preco_venda_sugerido, 0), 2);

  if v_total <= v_repasse_total then
    v_comissao := 0.00;
  else
    v_comissao := round(v_total * (v_item.comissao_percentual / 100.0), 2);
  end if;
  v_loja := round(v_total - v_comissao, 2);

  -- 5. Atualizar item da remessa:
  -- - Decrementar a reserva anterior (v_venda.quantidade)
  -- - Incrementar a quantidade vendida definitiva (v_qtd_final)
  update public.revenda_remessa_itens
  set quantidade_reservada = greatest(0, coalesce(quantidade_reservada, 0) - v_venda.quantidade),
      quantidade_vendida = quantidade_vendida + v_qtd_final,
      atualizado_em = now()
  where id = v_venda.remessa_item_id;

  -- 6. Atualizar a venda para status CONFIRMADA
  update public.revenda_vendas
  set status = 'CONFIRMADA',
      quantidade = v_qtd_final,
      preco_unitario_vendido = v_preco_final,
      subtotal_venda = v_subtotal,
      percentual_desconto = v_desc_percent,
      valor_desconto = v_desconto,
      total_venda = v_total,
      valor_total_bruto = v_subtotal,
      valor_comissao = v_comissao,
      valor_loja = v_loja,
      forma_pagamento = coalesce(p_forma_pagamento, v_venda.forma_pagamento),
      data_venda = coalesce(p_data_venda, v_venda.data_venda),
      observacao = coalesce(p_observacao, v_venda.observacao),
      confirmado_em = now(),
      confirmado_por = auth.uid()
  where id = p_venda_id;

  -- 7. Atualizar status da remessa
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
    'mensagem', 'Venda confirmada com sucesso.',
    'venda_id', p_venda_id,
    'status', 'CONFIRMADA',
    'quantidade', v_qtd_final,
    'total_venda', v_total,
    'comissao', v_comissao,
    'valor_loja', v_loja
  );
end;
$function$;


-- 8. RPC: ADMIN RECUSAR VENDA (LIBERA QUANTIDADE RESERVADA DE VOLTA PARA A REVENDEDORA)
create or replace function public.recusar_venda_revendedora(
  p_venda_id bigint,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_venda public.revenda_vendas%rowtype;
  v_item public.revenda_remessa_itens%rowtype;
begin
  -- Exigir perfil de Administrador ou Sócio
  if not public.e_admin_ou_socio() then
    raise exception 'Acesso restrito a administradores e sócios' using errcode = '42501';
  end if;

  -- 1. Bloqueio da venda
  select * into v_venda from public.revenda_vendas
  where id = p_venda_id
  for update;

  if not found then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;

  if v_venda.status != 'AGUARDANDO_CONFERENCIA' then
    raise exception 'Esta venda não está aguardando conferência (status atual: %)', v_venda.status using errcode = '22023';
  end if;

  -- 2. Bloqueio do item da remessa
  select * into v_item from public.revenda_remessa_itens
  where id = v_venda.remessa_item_id
  for update;

  if found then
    -- Libera a quantidade reservada de volta
    update public.revenda_remessa_itens
    set quantidade_reservada = greatest(0, coalesce(quantidade_reservada, 0) - v_venda.quantidade),
        atualizado_em = now()
    where id = v_venda.remessa_item_id;
  end if;

  -- 3. Atualiza venda para RECUSADA
  update public.revenda_vendas
  set status = 'RECUSADA',
      recusado_em = now(),
      recusado_por = auth.uid(),
      motivo_recusa = nullif(btrim(p_motivo), '')
  where id = p_venda_id;

  return jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Venda recusada. As peças foram liberadas de volta para o saldo disponível da revendedora.',
    'venda_id', p_venda_id,
    'status', 'RECUSADA',
    'quantidade_liberada', v_venda.quantidade
  );
end;
$function$;

-- Privilégios de execução
revoke all privileges on function public.registrar_venda_portal_revendedora(bigint, integer, numeric, text, timestamptz, text, numeric, text) from public, anon;
revoke all privileges on function public.confirmar_venda_revendedora(bigint, integer, numeric, timestamptz, text, text, numeric) from public, anon;
revoke all privileges on function public.recusar_venda_revendedora(bigint, text) from public, anon;

grant execute on function public.registrar_venda_portal_revendedora(bigint, integer, numeric, text, timestamptz, text, numeric, text) to authenticated, service_role;
grant execute on function public.confirmar_venda_revendedora(bigint, integer, numeric, timestamptz, text, text, numeric) to authenticated, service_role;
grant execute on function public.recusar_venda_revendedora(bigint, text) to authenticated, service_role;

commit;
