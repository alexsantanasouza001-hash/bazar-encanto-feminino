-- ====================================================================
-- MIGRATION: CHECKOUT MULTICOR — RESERVAS, BAIXAS E IDENTIFICAÇÃO POR VARIAÇÃO
-- BAZAR ENCANTO FEMININO
-- ====================================================================

begin;

-- 1. GARANTIR COLUNAS DE VARIAÇÃO EM PEDIDO_ITENS E RESERVAS_ESTOQUE
alter table public.pedido_itens
  add column if not exists produto_tamanho_id bigint references public.produto_tamanhos(id) on delete set null,
  add column if not exists variacao_id bigint references public.produto_variacoes(id) on delete set null,
  add column if not exists cor text,
  add column if not exists cor_hex text;

alter table public.reservas_estoque
  add column if not exists variacao_id bigint references public.produto_variacoes(id) on delete set null,
  add column if not exists cor text;

-- 2. FUNÇÃO BASE: CRIAR PEDIDO CHECKOUT COM SUPORTE A MÚLTIPLAS CORES
create or replace function public.criar_pedido_checkout(
  p_user_id uuid,
  p_email_cliente text,
  p_cliente text,
  p_itens jsonb,
  p_cupom text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
  v_preco numeric;
  v_item_subtotal numeric;
  v_subtotal numeric := 0;
  v_desconto numeric := 0;
  v_total numeric := 0;
  v_cupom text;
  v_pedido_id bigint;
  v_numero text;

  v_estoque_anterior integer;
  v_estoque_atual integer;
  v_resultado jsonb;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key é obrigatória'
      using errcode = '22023';
  end if;

  if p_cliente is null or btrim(p_cliente) = '' then
    raise exception 'Cliente não informado'
      using errcode = '22023';
  end if;

  if p_email_cliente is null
     or btrim(p_email_cliente) = ''
     or position('@' in p_email_cliente) <= 1 then
    raise exception 'E-mail inválido'
      using errcode = '22023';
  end if;

  if p_itens is null
     or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 then
    raise exception 'Carrinho vazio'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_itens) > 50 then
    raise exception 'O carrinho excede o limite de 50 itens'
      using errcode = '22023';
  end if;

  v_cupom := nullif(
    upper(btrim(coalesce(p_cupom, ''))),
    ''
  );

  if v_cupom is not null
     and v_cupom <> 'ENCANTO10' then
    raise exception 'Cupom inválido'
      using errcode = '22023';
  end if;

  -- Validação estrutural de cada item
  for v_item in
    select value
    from jsonb_array_elements(p_itens)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Item do carrinho inválido'
        using errcode = '22023';
    end if;

    if coalesce(v_item ->> 'produto_id', '') !~ '^[0-9]+$' then
      raise exception 'produto_id inválido'
        using errcode = '22023';
    end if;

    if coalesce(v_item ->> 'quantidade', '') !~ '^[0-9]+$' then
      raise exception 'Quantidade inválida'
        using errcode = '22023';
    end if;

    v_produto_id := (v_item ->> 'produto_id')::bigint;
    v_quantidade := (v_item ->> 'quantidade')::integer;

    if v_produto_id <= 0 then
      raise exception 'produto_id inválido'
        using errcode = '22023';
    end if;

    if v_quantidade <= 0 or v_quantidade > 100 then
      raise exception 'Quantidade deve estar entre 1 e 100'
        using errcode = '22023';
    end if;
  end loop;

  -- Validação de itens duplicados (diferencia produto_id + variacao/cor + tamanho)
  if exists (
    select 1
    from jsonb_to_recordset(p_itens)
      as r(
        produto_id bigint,
        variacao_id bigint,
        cor text,
        tamanho text,
        quantidade integer
      )
    group by
      r.produto_id,
      coalesce(r.variacao_id::text, lower(btrim(coalesce(r.cor, ''))), ''),
      coalesce(nullif(btrim(r.tamanho), ''), '')
    having count(*) > 1
  ) then
    raise exception 'Existem itens duplicados para a mesma variação e tamanho'
      using errcode = '22023';
  end if;

  -- Advisory lock transacional pela idempotency_key
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_idempotency_key::text,
      0
    )
  );

  -- Verificação de pedido idempotente já existente
  select *
  into v_pedido_existente
  from public.pedidos
  where idempotency_key = p_idempotency_key;

  if found then
    if v_pedido_existente.user_id is distinct from p_user_id
       or lower(btrim(coalesce(v_pedido_existente.email_cliente, ''))) <> lower(btrim(p_email_cliente))
       or v_pedido_existente.cupom is distinct from v_cupom
       or btrim(v_pedido_existente.cliente) <> btrim(p_cliente) then
      raise exception 'idempotency_key já utilizada por outro pedido'
        using errcode = '23505';
    end if;

    if (
      select count(*)
      from public.pedido_itens
      where pedido_id = v_pedido_existente.id
    ) <> jsonb_array_length(p_itens) then
      raise exception 'idempotency_key reutilizada com carrinho diferente'
        using errcode = '23505';
    end if;

    select jsonb_build_object(
      'id', p.id,
      'numero', p.numero,
      'cliente', p.cliente,
      'user_id', p.user_id,
      'email_cliente', p.email_cliente,
      'subtotal', p.subtotal,
      'desconto', p.desconto,
      'cupom', p.cupom,
      'total', p.total,
      'status', p.status,
      'origem', p.origem,
      'data', p.data,
      'itens', coalesce(
        (
          select jsonb_agg(to_jsonb(pi) order by pi.id)
          from public.pedido_itens pi
          where pi.pedido_id = p.id
        ),
        '[]'::jsonb
      )
    )
    into v_resultado
    from public.pedidos p
    where p.id = v_pedido_existente.id;

    return v_resultado;
  end if;

  -- Travar linhas de produtos envolvidos em ordem determinística
  perform p.id
  from public.produtos p
  join (
    select distinct r.produto_id
    from jsonb_to_recordset(p_itens) as r(produto_id bigint)
  ) req on req.produto_id = p.id
  order by p.id
  for update of p;

  -- Travar linhas de produto_tamanhos correspondentes
  perform pt.id
  from public.produto_tamanhos pt
  join (
    select distinct
      (r.produto_id)::bigint as produto_id,
      nullif(r.variacao_id, '')::bigint as variacao_id,
      nullif(btrim(r.tamanho), '') as tamanho
    from jsonb_to_recordset(p_itens) as r(produto_id bigint, variacao_id text, tamanho text)
    where nullif(btrim(r.tamanho), '') is not null
  ) req on req.produto_id = pt.produto_id
       and (req.variacao_id is null or req.variacao_id = pt.variacao_id)
       and req.tamanho = pt.tamanho
  order by pt.produto_id, pt.id
  for update of pt;

  -- Validação de preços e estoques antes de alterar
  for v_item in
    select value
    from jsonb_array_elements(p_itens)
  loop
    v_produto_id := (v_item ->> 'produto_id')::bigint;
    v_variacao_id := nullif(v_item ->> 'variacao_id', '')::bigint;
    v_cor := nullif(btrim(v_item ->> 'cor'), '');
    v_tamanho := nullif(btrim(v_item ->> 'tamanho'), '');
    v_quantidade := (v_item ->> 'quantidade')::integer;

    select *
    into v_produto
    from public.produtos
    where id = v_produto_id;

    if not found then
      raise exception 'Produto % não encontrado', v_produto_id
        using errcode = 'P0001';
    end if;

    if v_produto.venda is null or v_produto.venda < 0 then
      raise exception 'Preço inválido para o produto %', v_produto_id
        using errcode = 'P0001';
    end if;

    if v_tamanho is not null then
      -- Busca o tamanho específico da variação / cor
      if v_variacao_id is not null then
        select *
        into v_tamanho_registro
        from public.produto_tamanhos
        where produto_id = v_produto_id
          and variacao_id = v_variacao_id
          and tamanho = v_tamanho;
      elsif v_cor is not null then
        select pt.*
        into v_tamanho_registro
        from public.produto_tamanhos pt
        left join public.produto_variacoes pv on pv.id = pt.variacao_id
        where pt.produto_id = v_produto_id
          and (lower(coalesce(pt.cor, '')) = lower(v_cor) or lower(coalesce(pv.cor_nome, '')) = lower(v_cor))
          and pt.tamanho = v_tamanho
        order by pt.id
        limit 1;
      else
        select *
        into v_tamanho_registro
        from public.produto_tamanhos
        where produto_id = v_produto_id
          and tamanho = v_tamanho
        order by id
        limit 1;
      end if;

      if not found then
        raise exception 'Tamanho % indisponível para o produto % (%)',
          v_tamanho, v_produto.nome, coalesce(v_cor, 'Única')
          using errcode = 'P0001';
      end if;

      if v_tamanho_registro.quantidade < v_quantidade then
        raise exception 'Estoque insuficiente para o produto % na cor % e tamanho % (Disponível: %, Solicitado: %)',
          v_produto.nome, coalesce(v_tamanho_registro.cor, v_cor, 'Única'), v_tamanho, v_tamanho_registro.quantidade, v_quantidade
          using errcode = 'P0001';
      end if;
    else
      -- Produto sem grade de tamanho
      if v_produto.quantidade < v_quantidade then
        raise exception 'Estoque insuficiente para o produto % (Disponível: %, Solicitado: %)',
          v_produto.nome, v_produto.quantidade, v_quantidade
          using errcode = 'P0001';
      end if;
    end if;

    v_preco := v_produto.venda;
    v_item_subtotal := v_preco * v_quantidade;
    v_subtotal := v_subtotal + v_item_subtotal;
  end loop;

  if v_cupom = 'ENCANTO10' then
    v_desconto := round(v_subtotal * 0.10, 2);
  else
    v_desconto := 0;
  end if;

  v_total := greatest(v_subtotal - v_desconto, 0);

  v_pedido_id := nextval('public.pedidos_checkout_id_seq'::regclass);
  v_numero := 'PED-' || v_pedido_id::text;

  insert into public.pedidos (
    id,
    numero,
    cliente,
    subtotal,
    desconto,
    cupom,
    total,
    status,
    origem,
    data,
    user_id,
    email_cliente,
    idempotency_key
  )
  values (
    v_pedido_id,
    v_numero,
    btrim(p_cliente),
    v_subtotal,
    v_desconto,
    v_cupom,
    v_total,
    'Confirmado',
    'Loja',
    now(),
    p_user_id,
    btrim(p_email_cliente),
    p_idempotency_key
  );

  -- Efetuar a baixa atômica exata por variação e tamanho
  for v_item in
    select value
    from jsonb_array_elements(p_itens)
  loop
    v_produto_id := (v_item ->> 'produto_id')::bigint;
    v_variacao_id := nullif(v_item ->> 'variacao_id', '')::bigint;
    v_cor := nullif(btrim(v_item ->> 'cor'), '');
    v_cor_hex := nullif(btrim(v_item ->> 'cor_hex'), '');
    v_tamanho := nullif(btrim(v_item ->> 'tamanho'), '');
    v_quantidade := (v_item ->> 'quantidade')::integer;

    select * into v_produto from public.produtos where id = v_produto_id;

    v_preco := v_produto.venda;
    v_item_subtotal := v_preco * v_quantidade;
    v_estoque_anterior := v_produto.quantidade;
    v_estoque_atual := v_estoque_anterior - v_quantidade;

    if v_tamanho is not null then
      if v_variacao_id is not null then
        select * into v_tamanho_registro
        from public.produto_tamanhos
        where produto_id = v_produto_id
          and variacao_id = v_variacao_id
          and tamanho = v_tamanho
        for update;
      elsif v_cor is not null then
        select pt.* into v_tamanho_registro
        from public.produto_tamanhos pt
        left join public.produto_variacoes pv on pv.id = pt.variacao_id
        where pt.produto_id = v_produto_id
          and (lower(coalesce(pt.cor, '')) = lower(v_cor) or lower(coalesce(pv.cor_nome, '')) = lower(v_cor))
          and pt.tamanho = v_tamanho
        order by pt.id
        limit 1
        for update;
      else
        select * into v_tamanho_registro
        from public.produto_tamanhos
        where produto_id = v_produto_id
          and tamanho = v_tamanho
        order by id
        limit 1
        for update;
      end if;

      if not found then
        raise exception 'Falha ao localizar tamanho % para baixa de estoque', v_tamanho
          using errcode = 'P0001';
      end if;

      v_variacao_id := coalesce(v_variacao_id, v_tamanho_registro.variacao_id);
      v_cor := coalesce(v_cor, v_tamanho_registro.cor, v_produto.cor);
      v_cor_hex := coalesce(v_cor_hex, v_tamanho_registro.cor_hex);

      update public.produto_tamanhos
      set quantidade = quantidade - v_quantidade
      where id = v_tamanho_registro.id
        and quantidade >= v_quantidade;

      if not found then
        raise exception 'Estoque insuficiente no tamanho % para a cor %', v_tamanho, v_cor
          using errcode = 'P0001';
      end if;
    end if;

    update public.produtos
    set quantidade = quantidade - v_quantidade
    where id = v_produto_id
      and quantidade >= v_quantidade;

    if not found then
      raise exception 'Falha ao baixar estoque do produto %', v_produto.nome
        using errcode = 'P0001';
    end if;

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
      preco,
      subtotal
    )
    values (
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
      v_preco,
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
    )
    values (
      v_produto.id,
      v_produto.nome || coalesce(' (' || v_cor || ' - ' || v_tamanho || ')', coalesce(' (' || v_tamanho || ')', '')),
      'saida',
      v_quantidade,
      v_estoque_anterior,
      v_estoque_atual,
      'Venda pelo checkout - ' || coalesce(v_cor || ' / ', '') || coalesce('Tam: ' || v_tamanho, 'Único'),
      now()
    );
  end loop;

  select jsonb_build_object(
    'id', p.id,
    'numero', p.numero,
    'cliente', p.cliente,
    'user_id', p.user_id,
    'email_cliente', p.email_cliente,
    'subtotal', p.subtotal,
    'desconto', p.desconto,
    'cupom', p.cupom,
    'total', p.total,
    'status', p.status,
    'origem', p.origem,
    'data', p.data,
    'itens', coalesce(
      (
        select jsonb_agg(to_jsonb(pi) order by pi.id)
        from public.pedido_itens pi
        where pi.pedido_id = p.id
      ),
      '[]'::jsonb
    )
  )
  into v_resultado
  from public.pedidos p
  where p.id = v_pedido_id;

  return v_resultado;
end;
$function$;

-- 3. FUNÇÃO CRIAR PEDIDO PAGAMENTO (RESERVA EXATA COM VARIACAO_ID E PRODUTO_TAMANHO_ID)
create or replace function public.criar_pedido_pagamento(
  p_user_id uuid,
  p_email_cliente text,
  p_cliente text,
  p_itens jsonb,
  p_cupom text,
  p_idempotency_key uuid,
  p_entrega jsonb,
  p_forma_pagamento text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pedido jsonb;
  v_pedido_id bigint;
  v_numero text;
  v_existente public.pedidos%rowtype;
  v_ja_existia boolean;
  v_expira_em timestamptz := now() + interval '40 minutes';
begin
  if p_forma_pagamento not in ('Pix', 'Cartão de crédito') then
    raise exception 'Forma de pagamento inválida'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.pedidos
    where idempotency_key = p_idempotency_key
  )
  into v_ja_existia;

  v_pedido := public.criar_pedido_checkout(
    p_user_id,
    p_email_cliente,
    p_cliente,
    p_itens,
    p_cupom,
    p_idempotency_key,
    p_entrega
  );

  v_pedido_id := nullif(v_pedido->>'id', '')::bigint;

  if v_pedido_id is null then
    raise exception 'A RPC de checkout não retornou o id do pedido'
      using errcode = 'P0001';
  end if;

  select *
  into v_existente
  from public.pedidos
  where id = v_pedido_id
  for update;

  if not found then
    raise exception 'Pedido criado não encontrado'
      using errcode = 'P0001';
  end if;

  if v_ja_existia or v_existente.forma_pagamento is not null then
    if v_existente.forma_pagamento is null
      or v_existente.forma_pagamento <> p_forma_pagamento then
      raise exception 'idempotency_context_mismatch'
        using errcode = '23505';
    end if;

    return to_jsonb(v_existente) || jsonb_build_object(
      'itens', (
        select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)
        from public.pedido_itens i
        where i.pedido_id = v_existente.id
      )
    );
  end if;

  v_numero := v_existente.numero;

  update public.pedidos
  set status = 'Aguardando pagamento',
      forma_pagamento = p_forma_pagamento,
      status_pagamento = 'pendente',
      pagamento_provider = 'mercado_pago',
      pagamento_external_reference = v_numero,
      pagamento_idempotency_key = p_idempotency_key,
      pagamento_consulta_token = gen_random_uuid(),
      pagamento_atualizado_em = now(),
      reserva_status = 'reservado',
      reserva_expira_em = v_expira_em
  where id = v_pedido_id;

  -- Inserir reservas apontando para o produto_tamanho_id e variacao_id exatos
  insert into public.reservas_estoque (
    pedido_id,
    pedido_item_id,
    produto_id,
    produto_tamanho_id,
    variacao_id,
    cor,
    tamanho,
    quantidade,
    expires_at
  )
  select
    item.pedido_id,
    item.id,
    item.produto_id,
    item.produto_tamanho_id,
    item.variacao_id,
    item.cor,
    item.tamanho,
    item.quantidade,
    v_expira_em
  from public.pedido_itens item
  where item.pedido_id = v_pedido_id
  on conflict (pedido_item_id) do nothing;

  select *
  into v_existente
  from public.pedidos
  where id = v_pedido_id;

  return v_pedido || to_jsonb(v_existente) || jsonb_build_object(
    'itens', (
      select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)
      from public.pedido_itens i
      where i.pedido_id = v_pedido_id
    )
  );
end;
$function$;

-- 4. FUNÇÃO LIBERAR RESERVA PEDIDO (DEVOLUÇÃO EXATA AO PRODUTO_TAMANHOS E PRODUTOS)
create or replace function public.liberar_reserva_pedido(
  p_pedido_id bigint,
  p_motivo text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_reserva record;
  v_estoque_anterior integer;
  v_produto_nome text;
  v_liberou boolean := false;
begin
  for v_reserva in
    select *
    from public.reservas_estoque
    where pedido_id = p_pedido_id
      and status = 'reservado'
    order by produto_id, produto_tamanho_id nulls first, id
    for update
  loop
    select quantidade, nome
    into v_estoque_anterior, v_produto_nome
    from public.produtos
    where id = v_reserva.produto_id
    for update;

    if not found then
      raise exception 'Produto % da reserva não encontrado', v_reserva.produto_id
        using errcode = 'P0001';
    end if;

    update public.produtos
    set quantidade = quantidade + v_reserva.quantidade
    where id = v_reserva.produto_id;

    if v_reserva.produto_tamanho_id is not null then
      perform 1
      from public.produto_tamanhos
      where id = v_reserva.produto_tamanho_id
      for update;

      if found then
        update public.produto_tamanhos
        set quantidade = quantidade + v_reserva.quantidade
        where id = v_reserva.produto_tamanho_id;
      end if;
    elsif v_reserva.tamanho is not null then
      if v_reserva.variacao_id is not null then
        update public.produto_tamanhos
        set quantidade = quantidade + v_reserva.quantidade
        where produto_id = v_reserva.produto_id
          and variacao_id = v_reserva.variacao_id
          and tamanho = v_reserva.tamanho;
      else
        update public.produto_tamanhos
        set quantidade = quantidade + v_reserva.quantidade
        where produto_id = v_reserva.produto_id
          and tamanho = v_reserva.tamanho;
      end if;
    end if;

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
      v_reserva.produto_id,
      v_produto_nome || coalesce(' (' || v_reserva.cor || ' - ' || v_reserva.tamanho || ')', coalesce(' (' || v_reserva.tamanho || ')', '')),
      'entrada',
      v_reserva.quantidade,
      v_estoque_anterior,
      v_estoque_anterior + v_reserva.quantidade,
      format(
        'Liberação de reserva do pedido %s: %s',
        p_pedido_id,
        left(coalesce(p_motivo, 'pagamento não concluído'), 250)
      ),
      now()
    );

    update public.reservas_estoque
    set status = 'liberado',
        updated_at = now()
    where id = v_reserva.id;

    v_liberou := true;
  end loop;

  if v_liberou then
    update public.pedidos
    set reserva_status = 'liberado'
    where id = p_pedido_id
      and reserva_status = 'reservado';
  end if;

  return v_liberou;
end;
$function$;

-- 5. GRANTS DE EXECUÇÃO
revoke all privileges on function public.criar_pedido_checkout(uuid, text, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.criar_pedido_checkout(uuid, text, text, jsonb, text, uuid) to service_role;

revoke all privileges on function public.criar_pedido_pagamento(uuid, text, text, jsonb, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.criar_pedido_pagamento(uuid, text, text, jsonb, text, uuid, jsonb, text) to service_role;

revoke all privileges on function public.liberar_reserva_pedido(bigint, text) from public, anon, authenticated;
grant execute on function public.liberar_reserva_pedido(bigint, text) to service_role;

commit;
