-- ====================================================================
-- MIGRATION: STATUS OPERACIONAL DOS PEDIDOS, HISTÓRICO E ACOMPANHAMENTO
-- BAZAR ENCANTO FEMININO
-- ====================================================================

begin;

-- 1. ATUALIZAR CONSTRAINT DE STATUS OPERACIONAL EM PUBLIC.PEDIDOS
alter table public.pedidos
  drop constraint if exists pedidos_status_fluxo_check;

alter table public.pedidos
  add constraint pedidos_status_fluxo_check
  check (
    status in (
      'Aguardando pagamento',
      'Pedido recebido',
      'Confirmado',
      'Em preparação',
      'Enviado',
      'Pronto para retirada',
      'Entregue',
      'Concluído',
      'Cancelado'
    )
  ) not valid;

-- 2. CRIAR TABELA DE HISTÓRICO DE MUDANÇA DE STATUS (SE NÃO EXISTIR)
create table if not exists public.pedido_historico_status (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.pedidos(id) on delete cascade,
  status_anterior text,
  status_novo text not null,
  usuario_responsavel text,
  criado_em timestamptz not null default now()
);

create index if not exists pedido_historico_status_pedido_idx
  on public.pedido_historico_status (pedido_id, criado_em desc);

alter table public.pedido_historico_status enable row level security;

drop policy if exists "Historico acessivel por autenticados e anon" on public.pedido_historico_status;
create policy "Historico acessivel por autenticados e anon"
  on public.pedido_historico_status
  for select to authenticated, anon
  using (true);

drop policy if exists "Insercao de historico por admin" on public.pedido_historico_status;
create policy "Insercao de historico por admin"
  on public.pedido_historico_status
  for insert to authenticated, anon
  with check (true);

-- 3. RECREATE / REPLACE DA RPC CRIAR_VENDA_DIRETA COM STATUS OPERACIONAL INICIAL 'Pedido recebido'
create or replace function public.criar_venda_direta(
  p_cliente text,
  p_telefone text,
  p_email text,
  p_itens jsonb,
  p_modalidade_entrega text,
  p_dados_entrega jsonb,
  p_forma_pagamento text,
  p_observacao_interna text,
  p_atendente text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_produto public.produtos%rowtype;
  v_tamanho_registro public.produto_tamanhos%rowtype;
  v_pedido_existente public.pedidos%rowtype;

  v_produto_id bigint;
  v_variacao_id bigint;
  v_cor text;
  v_cor_hex text;
  v_tamanho text;
  v_quantidade integer;
  v_custo numeric;
  v_preco_original numeric;
  v_preco_praticado numeric;
  v_desconto_percentual numeric;
  v_desconto_valor numeric;
  v_item_subtotal numeric;

  v_subtotal numeric := 0;
  v_total_descontos numeric := 0;
  v_valor_frete numeric := 0;
  v_total numeric := 0;

  v_pedido_id bigint;
  v_numero text;
  v_codigo_seguro text;
  v_estoque_anterior integer;
  v_estoque_atual integer;
  v_resultado jsonb;

  v_cep text := null;
  v_endereco text := null;
  v_num_end text := null;
  v_comp text := null;
  v_bairro text := null;
  v_cidade text := null;
  v_estado text := null;
  v_transportadora text := null;
  v_servico text := null;
  v_prazo text := null;
  v_tel_norm text;

  v_forma_pag text;
  v_status_inicial text := 'Pedido recebido';
  v_status_pag_inicial text;
  v_pix_conf_em timestamptz := null;
  v_pix_conf_por text := null;
begin
  if p_cliente is null or btrim(p_cliente) = '' then
    raise exception 'Nome da cliente é obrigatório na Venda Direta.'
      using errcode = '22023';
  end if;

  if p_telefone is null or btrim(p_telefone) = '' then
    raise exception 'Telefone / WhatsApp da cliente é obrigatório na Venda Direta.'
      using errcode = '22023';
  end if;

  v_tel_norm := btrim(p_telefone);

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum produto adicionado à Venda Direta.'
      using errcode = '22023';
  end if;

  if p_idempotency_key is null then
    p_idempotency_key := gen_random_uuid();
  end if;

  -- Advisory lock transacional pela idempotency_key
  perform pg_advisory_xact_lock(
    hashtextextended(p_idempotency_key::text, 0)
  );

  -- Verificação de pedido idempotente já existente
  select *
  into v_pedido_existente
  from public.pedidos
  where idempotency_key = p_idempotency_key;

  if found then
    select jsonb_build_object(
      'id', p.id,
      'numero', p.numero,
      'codigo_acompanhamento', p.codigo_acompanhamento,
      'cliente', p.cliente,
      'telefone_cliente', coalesce(p.telefone_cliente, p.telefone),
      'telefone', coalesce(p.telefone, p.telefone_cliente),
      'email_cliente', p.email_cliente,
      'subtotal', p.subtotal,
      'desconto', p.desconto,
      'valor_frete', p.valor_frete,
      'total', p.total,
      'status', p.status,
      'status_pagamento', p.status_pagamento,
      'forma_pagamento', p.forma_pagamento,
      'origem', p.origem,
      'modalidade_entrega', p.modalidade_entrega,
      'atendente', p.atendente,
      'itens', (
        select coalesce(jsonb_agg(to_jsonb(pi) order by pi.id), '[]'::jsonb)
        from public.pedido_itens pi
        where pi.pedido_id = p.id
      )
    )
    into v_resultado
    from public.pedidos p
    where p.id = v_pedido_existente.id;

    return v_resultado;
  end if;

  -- Tratar e sanitizar dados de entrega para satisfazer constraints do schema
  if p_dados_entrega is not null and jsonb_typeof(p_dados_entrega) = 'object' then
    v_cep := nullif(regexp_replace(coalesce(p_dados_entrega->>'cep', ''), '[^0-9]', '', 'g'), '');
    if v_cep is not null and v_cep !~ '^[0-9]{8}$' then
      v_cep := null;
    end if;

    v_endereco := nullif(btrim(coalesce(p_dados_entrega->>'endereco', '')), '');
    v_num_end := nullif(btrim(coalesce(p_dados_entrega->>'numero', '')), '');
    v_comp := nullif(btrim(coalesce(p_dados_entrega->>'complemento', '')), '');
    v_bairro := nullif(btrim(coalesce(p_dados_entrega->>'bairro', '')), '');
    v_cidade := nullif(btrim(coalesce(p_dados_entrega->>'cidade', '')), '');
    v_estado := nullif(upper(btrim(coalesce(p_dados_entrega->>'estado', ''))), '');
    if v_estado is not null and v_estado !~ '^[A-Z]{2}$' then
      v_estado := null;
    end if;

    v_transportadora := nullif(btrim(coalesce(p_dados_entrega->>'transportadora', '')), '');
    v_servico := nullif(btrim(coalesce(p_dados_entrega->>'servico', '')), '');
    v_prazo := nullif(btrim(coalesce(p_dados_entrega->>'prazo', '')), '');

    if p_dados_entrega ? 'valor_frete' and (p_dados_entrega->>'valor_frete') ~ '^[0-9]+(\.[0-9]{1,2})?$' then
      v_valor_frete := (p_dados_entrega->>'valor_frete')::numeric;
    end if;
  end if;

  -- Travar produtos envolvidos para verificação atômica
  perform p.id
  from public.produtos p
  join (
    select distinct (r.produto_id)::bigint as produto_id
    from jsonb_to_recordset(p_itens) as r(produto_id bigint)
  ) req on req.produto_id = p.id
  order by p.id
  for update of p;

  -- Validação de todos os itens e estoques
  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_produto_id := (v_item ->> 'produto_id')::bigint;
    v_variacao_id := nullif(v_item ->> 'variacao_id', '')::bigint;
    v_cor := nullif(btrim(v_item ->> 'cor'), '');
    v_tamanho := nullif(btrim(v_item ->> 'tamanho'), '');
    v_quantidade := (v_item ->> 'quantidade')::integer;
    v_preco_praticado := coalesce((v_item ->> 'preco_praticado')::numeric, (v_item ->> 'preco')::numeric, 0);
    v_desconto_percentual := coalesce((v_item ->> 'desconto_percentual')::numeric, 0);

    select * into v_produto from public.produtos where id = v_produto_id;
    if not found then
      raise exception 'Produto % não encontrado.', v_produto_id using errcode = 'P0001';
    end if;

    if v_tamanho is not null then
      if v_variacao_id is not null then
        select * into v_tamanho_registro
        from public.produto_tamanhos
        where produto_id = v_produto_id and variacao_id = v_variacao_id and tamanho = v_tamanho;
      elsif v_cor is not null then
        select pt.* into v_tamanho_registro
        from public.produto_tamanhos pt
        left join public.produto_variacoes pv on pv.id = pt.variacao_id
        where pt.produto_id = v_produto_id
          and (lower(coalesce(pt.cor, '')) = lower(v_cor) or lower(coalesce(pv.cor_nome, '')) = lower(v_cor))
          and pt.tamanho = v_tamanho
        order by pt.id limit 1;
      else
        select * into v_tamanho_registro
        from public.produto_tamanhos
        where produto_id = v_produto_id and tamanho = v_tamanho
        order by id limit 1;
      end if;

      if not found then
        raise exception 'Tamanho % indisponível para o produto % (%)',
          v_tamanho, v_produto.nome, coalesce(v_cor, 'Única') using errcode = 'P0001';
      end if;

      if v_tamanho_registro.quantidade < v_quantidade then
        raise exception 'Estoque insuficiente para o produto % na cor % e tamanho % (Disponível: %, Solicitado: %)',
          v_produto.nome, coalesce(v_tamanho_registro.cor, v_cor, 'Única'), v_tamanho, v_tamanho_registro.quantidade, v_quantidade
          using errcode = 'P0001';
      end if;
    else
      if v_produto.quantidade < v_quantidade then
        raise exception 'Estoque insuficiente para o produto % (Disponível: %, Solicitado: %)',
          v_produto.nome, v_produto.quantidade, v_quantidade using errcode = 'P0001';
      end if;
    end if;

    v_preco_original := coalesce(v_produto.venda, 0);
    if v_preco_praticado <= 0 then
      v_preco_praticado := v_preco_original;
    end if;

    if v_desconto_percentual > 0 then
      v_desconto_valor := round((v_preco_praticado * (v_desconto_percentual / 100.0)), 2);
    else
      v_desconto_valor := 0;
    end if;

    v_item_subtotal := (v_preco_praticado - v_desconto_valor) * v_quantidade;
    v_subtotal := v_subtotal + (v_preco_praticado * v_quantidade);
    v_total_descontos := v_total_descontos + (v_desconto_valor * v_quantidade);
  end loop;

  v_total := greatest(0, (v_subtotal - v_total_descontos) + v_valor_frete);

  -- Gerar identificadores seguros do pedido
  v_pedido_id := nextval('public.pedidos_checkout_id_seq'::regclass);
  v_numero := 'PED-' || v_pedido_id::text;

  loop
    v_codigo_seguro := public.gerar_codigo_acompanhamento_pedido();
    exit when not exists (select 1 from public.pedidos where codigo_acompanhamento = v_codigo_seguro);
  end loop;

  -- Definir status operacional e de pagamento
  v_forma_pag := coalesce(nullif(btrim(p_forma_pagamento), ''), 'Pix');

  if lower(v_forma_pag) = 'pix' then
    v_status_inicial := 'Pedido recebido';
    v_status_pag_inicial := 'aprovado';
    v_pix_conf_em := now();
    v_pix_conf_por := coalesce(nullif(btrim(p_atendente), ''), 'Admin');
  else
    v_status_inicial := 'Pedido recebido';
    v_status_pag_inicial := 'pendente';
    v_pix_conf_em := null;
    v_pix_conf_por := null;
  end if;

  -- Inserir Pedido Real de Venda Direta
  insert into public.pedidos (
    id,
    numero,
    codigo_acompanhamento,
    cliente,
    telefone_cliente,
    telefone,
    email_cliente,
    subtotal,
    desconto,
    valor_frete,
    total,
    status,
    status_pagamento,
    forma_pagamento,
    origem,
    modalidade_entrega,
    atendente,
    observacao_interna,
    data,
    idempotency_key,
    cep_entrega,
    endereco_entrega,
    numero_entrega,
    complemento_entrega,
    bairro_entrega,
    cidade_entrega,
    estado_entrega,
    transportadora_frete,
    servico_frete,
    prazo_frete,
    pix_confirmado_em,
    pix_confirmado_por,
    pagamento_atualizado_em,
    atualizado_em
  ) values (
    v_pedido_id,
    v_numero,
    v_codigo_seguro,
    btrim(p_cliente),
    v_tel_norm,
    v_tel_norm,
    nullif(lower(btrim(coalesce(p_email, ''))), ''),
    v_subtotal,
    v_total_descontos,
    v_valor_frete,
    v_total,
    v_status_inicial,
    v_status_pag_inicial,
    v_forma_pag,
    'venda_direta',
    coalesce(nullif(btrim(p_modalidade_entrega), ''), 'correios'),
    nullif(btrim(coalesce(p_atendente, '')), ''),
    nullif(btrim(coalesce(p_observacao_interna, '')), ''),
    now(),
    p_idempotency_key,
    v_cep,
    v_endereco,
    v_num_end,
    v_comp,
    v_bairro,
    v_cidade,
    v_estado,
    v_transportadora,
    v_servico,
    v_prazo,
    v_pix_conf_em,
    v_pix_conf_por,
    case when lower(v_forma_pag) = 'pix' then now() else null end,
    now()
  );

  -- Registrar evento inicial no histórico de status
  insert into public.pedido_historico_status (
    pedido_id,
    status_anterior,
    status_novo,
    usuario_responsavel
  ) values (
    v_pedido_id,
    null,
    v_status_inicial,
    coalesce(p_atendente, 'Admin')
  );

  -- Efetuar baixa atômica exata de estoque e inserir itens históricos
  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_produto_id := (v_item ->> 'produto_id')::bigint;
    v_variacao_id := nullif(v_item ->> 'variacao_id', '')::bigint;
    v_cor := nullif(btrim(v_item ->> 'cor'), '');
    v_cor_hex := nullif(btrim(v_item ->> 'cor_hex'), '');
    v_tamanho := nullif(btrim(v_item ->> 'tamanho'), '');
    v_quantidade := (v_item ->> 'quantidade')::integer;
    v_preco_praticado := coalesce((v_item ->> 'preco_praticado')::numeric, (v_item ->> 'preco')::numeric, 0);
    v_desconto_percentual := coalesce((v_item ->> 'desconto_percentual')::numeric, 0);

    select * into v_produto from public.produtos where id = v_produto_id;
    v_custo := coalesce(v_produto.custo, 0);
    v_preco_original := coalesce(v_produto.venda, 0);
    if v_preco_praticado <= 0 then
      v_preco_praticado := v_preco_original;
    end if;

    if v_desconto_percentual > 0 then
      v_desconto_valor := round((v_preco_praticado * (v_desconto_percentual / 100.0)), 2);
    else
      v_desconto_valor := 0;
    end if;

    v_item_subtotal := (v_preco_praticado - v_desconto_valor) * v_quantidade;
    v_estoque_anterior := v_produto.quantidade;
    v_estoque_atual := v_estoque_anterior - v_quantidade;

    if v_tamanho is not null then
      if v_variacao_id is not null then
        select * into v_tamanho_registro
        from public.produto_tamanhos
        where produto_id = v_produto_id and variacao_id = v_variacao_id and tamanho = v_tamanho
        for update;
      elsif v_cor is not null then
        select pt.* into v_tamanho_registro
        from public.produto_tamanhos pt
        left join public.produto_variacoes pv on pv.id = pt.variacao_id
        where pt.produto_id = v_produto_id
          and (lower(coalesce(pt.cor, '')) = lower(v_cor) or lower(coalesce(pv.cor_nome, '')) = lower(v_cor))
          and pt.tamanho = v_tamanho
        order by pt.id limit 1
        for update;
      else
        select * into v_tamanho_registro
        from public.produto_tamanhos
        where produto_id = v_produto_id and tamanho = v_tamanho
        order by id limit 1
        for update;
      end if;

      v_variacao_id := coalesce(v_variacao_id, v_tamanho_registro.variacao_id);
      v_cor := coalesce(v_cor, v_tamanho_registro.cor, v_produto.cor);
      v_cor_hex := coalesce(v_cor_hex, v_tamanho_registro.cor_hex);

      update public.produto_tamanhos
      set quantidade = quantidade - v_quantidade
      where id = v_tamanho_registro.id
        and quantidade >= v_quantidade;
    end if;

    update public.produtos
    set quantidade = quantidade - v_quantidade
    where id = v_produto_id
      and quantidade >= v_quantidade;

    insert into public.pedido_itens (
      pedido_id,
      produto_id,
      produto_tamanho_id,
      variacao_id,
      nome,
      marca,
      categoria,
      tamanho,
      cor,
      cor_hex,
      sku,
      quantidade,
      custo,
      preco_original,
      preco_praticado,
      desconto_percentual,
      desconto_valor,
      preco,
      subtotal
    ) values (
      v_pedido_id,
      v_produto.id,
      v_tamanho_registro.id,
      v_variacao_id,
      v_produto.nome,
      v_produto.marca,
      v_produto.categoria,
      v_tamanho,
      coalesce(v_cor, v_produto.cor, 'Única'),
      v_cor_hex,
      v_produto.sku,
      v_quantidade,
      v_custo,
      v_preco_original,
      v_preco_praticado,
      v_desconto_percentual,
      v_desconto_valor,
      (v_preco_praticado - v_desconto_valor),
      v_item_subtotal
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
      v_produto.id,
      v_produto.nome || coalesce(' (' || v_cor || ' - ' || v_tamanho || ')', coalesce(' (' || v_tamanho || ')', '')),
      'saida',
      v_quantidade,
      v_estoque_anterior,
      v_estoque_atual,
      'Venda Direta WhatsApp - ' || coalesce(v_cor || ' / ', '') || coalesce('Tam: ' || v_tamanho, 'Único'),
      now()
    );
  end loop;

  select jsonb_build_object(
    'id', p.id,
    'numero', p.numero,
    'codigo_acompanhamento', p.codigo_acompanhamento,
    'cliente', p.cliente,
    'telefone_cliente', coalesce(p.telefone_cliente, p.telefone),
    'telefone', coalesce(p.telefone, p.telefone_cliente),
    'email_cliente', p.email_cliente,
    'subtotal', p.subtotal,
    'desconto', p.desconto,
    'valor_frete', p.valor_frete,
    'total', p.total,
    'status', p.status,
    'status_pagamento', p.status_pagamento,
    'forma_pagamento', p.forma_pagamento,
    'origem', p.origem,
    'modalidade_entrega', p.modalidade_entrega,
    'atendente', p.atendente,
    'data', p.data,
    'itens', (
      select coalesce(jsonb_agg(to_jsonb(pi) order by pi.id), '[]'::jsonb)
      from public.pedido_itens pi
      where pi.pedido_id = p.id
    )
  )
  into v_resultado
  from public.pedidos p
  where p.id = v_pedido_id;

  return v_resultado;
end;
$$;

grant execute on function public.criar_venda_direta(text, text, text, jsonb, text, jsonb, text, text, text, uuid) to anon, authenticated, service_role;

-- 4. RECREATE / REPLACE DA RPC ATUALIZAR_PEDIDO_POS_VENDA COM SUPORTE AOS NOVOS STATUS E REGISTRO DE HISTÓRICO
drop function if exists public.atualizar_pedido_pos_venda(bigint, text, text, text, text, text, text);
drop function if exists public.atualizar_pedido_pos_venda(bigint, text, text, text, text, text, text, text);

create or replace function public.atualizar_pedido_pos_venda(
  p_pedido_id bigint,
  p_novo_status text,
  p_transportadora text default null,
  p_codigo_rastreio text default null,
  p_url_rastreio text default null,
  p_observacao_envio text default null,
  p_observacao_interna text default null,
  p_usuario_responsavel text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pedido public.pedidos%rowtype;
  v_status_atual text;
  v_novo_status text := nullif(btrim(p_novo_status), '');
  v_transportadora text := nullif(btrim(p_transportadora), '');
  v_codigo_rastreio text := nullif(btrim(p_codigo_rastreio), '');
  v_url_rastreio text := nullif(btrim(p_url_rastreio), '');
  v_observacao text := nullif(btrim(p_observacao_envio), '');
  v_observacao_interna text := coalesce(nullif(btrim(p_observacao_interna), ''), nullif(btrim(p_observacao_envio), ''));
  v_usuario text := coalesce(nullif(btrim(p_usuario_responsavel), ''), 'Admin');
begin
  if p_pedido_id is null or p_pedido_id <= 0 then
    raise exception 'Pedido inválido' using errcode = '22023';
  end if;

  if v_novo_status is null or v_novo_status not in (
    'Aguardando pagamento', 'Pedido recebido', 'Confirmado', 'Em preparação', 'Enviado',
    'Pronto para retirada', 'Entregue', 'Concluído', 'Cancelado'
  ) then
    raise exception 'Status de pedido inválido: %', v_novo_status using errcode = '22023';
  end if;

  if length(coalesce(v_transportadora, '')) > 120
    or length(coalesce(v_codigo_rastreio, '')) > 120
    or length(coalesce(v_url_rastreio, '')) > 500
    or length(coalesce(v_observacao, '')) > 500
    or length(coalesce(v_observacao_interna, '')) > 1000 then
    raise exception 'Dados administrativos excedem o limite permitido'
      using errcode = '22023';
  end if;

  if v_url_rastreio is not null and v_url_rastreio !~ '^https://' then
    raise exception 'A URL de rastreio deve usar HTTPS'
      using errcode = '22023';
  end if;

  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado' using errcode = 'P0001';
  end if;

  v_status_atual := v_pedido.status;

  -- Se for cancelamento de reserva pendente
  if v_novo_status = 'Cancelado'
    and v_pedido.status_pagamento = 'pendente'
    and v_pedido.reserva_status = 'reservado' then
    perform public.liberar_reserva_pedido(
      p_pedido_id,
      'Cancelamento administrativo do pedido'
    );
  end if;

  -- Gravar histórico se o status mudou
  if v_status_atual is distinct from v_novo_status then
    insert into public.pedido_historico_status (
      pedido_id,
      status_anterior,
      status_novo,
      usuario_responsavel
    ) values (
      p_pedido_id,
      v_status_atual,
      v_novo_status,
      v_usuario
    );
  end if;

  update public.pedidos
  set status = v_novo_status,
      status_pagamento = case
        when v_novo_status = 'Cancelado'
          and status_pagamento = 'pendente'
          then 'cancelado'
        else status_pagamento
      end,
      transportadora = case
        when v_novo_status = 'Enviado' and v_transportadora is not null then v_transportadora
        else transportadora
      end,
      codigo_rastreio = case
        when v_novo_status = 'Enviado' and v_codigo_rastreio is not null then v_codigo_rastreio
        else codigo_rastreio
      end,
      url_rastreio = case
        when v_novo_status = 'Enviado' and v_url_rastreio is not null then v_url_rastreio
        else url_rastreio
      end,
      observacao_envio = case
        when v_novo_status = 'Enviado' and v_observacao is not null then v_observacao
        else observacao_envio
      end,
      observacao_interna = coalesce(v_observacao_interna, observacao_interna),
      enviado_em = case
        when v_novo_status = 'Enviado' then coalesce(enviado_em, now())
        else enviado_em
      end,
      entregue_em = case
        when v_novo_status = 'Entregue' then coalesce(entregue_em, now())
        else entregue_em
      end,
      atualizado_em = now()
  where id = p_pedido_id;

  return jsonb_build_object(
    'sucesso', true,
    'pedido_id', p_pedido_id,
    'status', v_novo_status,
    'status_pagamento', v_pedido.status_pagamento,
    'codigo_rastreio', coalesce(v_codigo_rastreio, v_pedido.codigo_rastreio),
    'transportadora', coalesce(v_transportadora, v_pedido.transportadora)
  );
end;
$function$;

grant execute on function public.atualizar_pedido_pos_venda(bigint, text, text, text, text, text, text, text) to anon, authenticated, service_role;

-- 5. RECREATE / REPLACE DA RPC CONSULTAR_PEDIDO_PUBLICO RETORNANDO MODALIDADE_ENTREGA
create or replace function public.consultar_pedido_publico(
  p_numero text default null,
  p_email text default null,
  p_codigo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido record;
  v_codigo_busca text;
  v_numero_busca text;
  v_email_busca text;
begin
  v_codigo_busca := upper(nullif(btrim(coalesce(p_codigo, '')), ''));
  v_numero_busca := upper(nullif(btrim(coalesce(p_numero, '')), ''));
  v_email_busca  := lower(nullif(btrim(coalesce(p_email, '')), ''));

  if v_codigo_busca is not null and v_codigo_busca ~ '^ENC-[0-9A-Z]{4,16}$' then
    select *
    into v_pedido
    from public.pedidos
    where upper(codigo_acompanhamento) = v_codigo_busca
    limit 1;
  elsif v_numero_busca is not null and v_numero_busca ~ '^ENC-[0-9A-Z]{4,16}$' then
    select *
    into v_pedido
    from public.pedidos
    where upper(codigo_acompanhamento) = v_numero_busca
    limit 1;
  elsif v_numero_busca is not null and v_numero_busca ~ '^PED-[0-9]{1,20}$' and v_email_busca is not null and v_email_busca ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    select *
    into v_pedido
    from public.pedidos
    where upper(numero) = v_numero_busca
      and lower(coalesce(email_cliente, '')) = v_email_busca
    limit 1;
  else
    return null;
  end if;

  if v_pedido.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'numero', v_pedido.numero,
    'codigo_acompanhamento', v_pedido.codigo_acompanhamento,
    'status', v_pedido.status,
    'status_pagamento', v_pedido.status_pagamento,
    'forma_pagamento', v_pedido.forma_pagamento,
    'modalidade_entrega', coalesce(v_pedido.modalidade_entrega, 'correios'),
    'data', v_pedido.data,
    'atualizado_em', coalesce(v_pedido.atualizado_em, v_pedido.data),
    'valor_frete', coalesce(v_pedido.valor_frete, 0),
    'total', coalesce(v_pedido.total, 0),
    'transportadora', coalesce(v_pedido.transportadora, v_pedido.transportadora_frete),
    'codigo_rastreio', v_pedido.codigo_rastreio,
    'url_rastreio', v_pedido.url_rastreio,
    'cidade_entrega', v_pedido.cidade_entrega,
    'estado_entrega', v_pedido.estado_entrega,
    'itens', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'nome', i.nome,
            'tamanho', i.tamanho,
            'cor', i.cor,
            'quantidade', i.quantidade,
            'subtotal', i.subtotal
          ) order by i.id
        ),
        '[]'::jsonb
      )
      from public.pedido_itens i
      where i.pedido_id = v_pedido.id
    )
  );
end;
$$;

grant execute on function public.consultar_pedido_publico(text, text, text) to anon, authenticated, service_role;

commit;
