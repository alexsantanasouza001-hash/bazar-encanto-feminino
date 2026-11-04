-- ====================================================================
-- MIGRATION: CORREÇÃO DA CONFIRMAÇÃO MANUAL DE PIX DE VENDA DIRETA
-- BAZAR ENCANTO FEMININO
-- ====================================================================

begin;

-- 1. RECREATE / REPLACE DA RPC CONFIRMAR_PAGAMENTO_PIX_VENDA_DIRETA COM REGRAS ESTRITAS E IDEMPOTÊNCIA
create or replace function public.confirmar_pagamento_pix_venda_direta(
  p_pedido_id bigint,
  p_confirmado_por text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_confirmador text;
  v_novo_status text;
begin
  if p_pedido_id is null or p_pedido_id <= 0 then
    raise exception 'ID do pedido inválido.' using errcode = '22023';
  end if;

  v_confirmador := coalesce(nullif(btrim(p_confirmado_por), ''), 'Admin');

  -- Travar linha do pedido para atualização transacional
  select *
  into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido % não encontrado.', p_pedido_id using errcode = 'P0001';
  end if;

  -- Regra 1: Confirmação manual é permitida APENAS para pedidos de Venda Direta
  if coalesce(v_pedido.origem, '') <> 'venda_direta' then
    raise exception 'Confirmação manual de Pix é permitida exclusivamente para pedidos de Venda Direta.'
      using errcode = 'P0001';
  end if;

  -- Regra 2: Idempotência - se o pedido já estiver com pagamento aprovado/pago
  if lower(coalesce(v_pedido.status_pagamento, '')) in ('pago', 'aprovado') then
    return jsonb_build_object(
      'sucesso', true,
      'idempotente', true,
      'pedido_id', p_pedido_id,
      'status_pagamento', v_pedido.status_pagamento,
      'status', v_pedido.status,
      'pix_confirmado_em', v_pedido.pix_confirmado_em,
      'pix_confirmado_por', v_pedido.pix_confirmado_por,
      'mensagem', 'Pagamento Pix já se encontrava confirmado anteriormente.'
    );
  end if;

  -- Determinar novo status do pedido (se estava 'Aguardando pagamento', avança para 'Confirmado')
  if v_pedido.status = 'Aguardando pagamento' then
    v_novo_status := 'Confirmado';
  else
    v_novo_status := v_pedido.status;
  end if;

  -- Atualização atômica do status do pagamento e histórico
  update public.pedidos
  set status_pagamento = 'pago',
      status = v_novo_status,
      pix_confirmado_em = now(),
      pix_confirmado_por = v_confirmador,
      pagamento_atualizado_em = now(),
      atualizado_em = now()
  where id = p_pedido_id;

  return jsonb_build_object(
    'sucesso', true,
    'idempotente', false,
    'pedido_id', p_pedido_id,
    'status_pagamento', 'pago',
    'status', v_novo_status,
    'pix_confirmado_em', now(),
    'pix_confirmado_por', v_confirmador,
    'mensagem', 'Pagamento Pix confirmado manualmente com sucesso.'
  );
end;
$$;

-- 2. GRANT DE EXECUÇÃO
grant execute on function public.confirmar_pagamento_pix_venda_direta(bigint, text) to anon, authenticated, service_role;

commit;
