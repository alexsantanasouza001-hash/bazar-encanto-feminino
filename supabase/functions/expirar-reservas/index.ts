import { createClient } from 'npm:@supabase/supabase-js@2.112.2'

type JsonObject = Record<string, unknown>

function eObjeto(valor: unknown): valor is JsonObject {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function primeiroPagamento(order: JsonObject) {
  const transactions = eObjeto(order.transactions) ? order.transactions : null
  const payments = transactions && Array.isArray(transactions.payments)
    ? transactions.payments
    : []
  return eObjeto(payments[0]) ? payments[0] : null
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
  const cronSecret = Deno.env.get('RESERVAS_CRON_SECRET')
  const authorization = request.headers.get('authorization')

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !accessToken ||
    !cronSecret ||
    authorization !== `Bearer ${cronSecret}`
  ) {
    return new Response(null, { status: 401 })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: pedidos, error } = await adminClient
    .from('pedidos')
    .select('id,pagamento_id,pagamento_external_reference,total')
    .eq('reserva_status', 'reservado')
    .eq('status_pagamento', 'pendente')
    .not('pagamento_id', 'is', null)
    .lte('reserva_expira_em', new Date().toISOString())
    .limit(100)

  if (error) {
    console.error('expirar-reservas: falha ao listar reservas', { code: error.code })
    return new Response(null, { status: 500 })
  }

  let reconciliadas = 0

  for (const pedido of pedidos || []) {
    const respostaOrder = await fetch(
      `https://api.mercadopago.com/v1/orders/${encodeURIComponent(String(pedido.pagamento_id))}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    // Falha ou indisponibilidade nunca libera estoque.
    if (!respostaOrder.ok) continue

    const order: unknown = await respostaOrder.json()
    if (!eObjeto(order)) continue

    const pagamento = primeiroPagamento(order)
    const statusProvider = String(pagamento?.status || order.status || '')
    const statusDetail = String(pagamento?.status_detail || order.status_detail || '')

    const totalProviderRaw =
      order.total_amount ??
      order.transaction_amount ??
      pagamento?.transaction_amount ??
      pagamento?.total_paid_amount

    const totalProvider = Number.isFinite(Number(totalProviderRaw))
      ? Number(totalProviderRaw)
      : null

    const { error: erroAtualizacao } = await adminClient.rpc(
      'registrar_resultado_pagamento',
      {
        p_pedido_id: Number(pedido.id),
        p_pagamento_id: String(order.id),
        p_external_reference: String(order.external_reference || ''),
        p_status_provider: statusProvider,
        p_status_detail: statusDetail,
        p_total_provider: totalProvider,
        p_pix_expiracao: null,
      },
    )

    if (!erroAtualizacao) reconciliadas += 1
  }

  return new Response(JSON.stringify({ reconciliadas }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
})
