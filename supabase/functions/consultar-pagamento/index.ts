import { createClient } from 'npm:@supabase/supabase-js@2.112.2'

type JsonObject = Record<string, unknown>

const ORIGENS_PADRAO = [
  'https://bazar-encanto-feminino.vercel.app',
  'http://localhost:5173',
]

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

function responder(status: number, corpo: Record<string, unknown>, origem: string) {
  const configuradas = Deno.env.get('CHECKOUT_ALLOWED_ORIGINS')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const origens = configuradas?.length ? configuradas : ORIGENS_PADRAO
  const origemPermitida = origens.includes(origem) ? origem : ORIGENS_PADRAO[0]

  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'Access-Control-Allow-Origin': origemPermitida,
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    },
  })
}

Deno.serve(async (request) => {
  const origem = request.headers.get('origin') || ''
  if (request.method === 'OPTIONS') return responder(204, {}, origem)
  if (request.method !== 'POST') return responder(405, { sucesso: false }, origem)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')

  if (!supabaseUrl || !serviceRoleKey || !accessToken) {
    return responder(503, { sucesso: false }, origem)
  }

  let corpo: unknown
  try {
    corpo = await request.json()
  } catch {
    return responder(400, { sucesso: false }, origem)
  }

  if (!eObjeto(corpo)) return responder(400, { sucesso: false }, origem)
  const numero = typeof corpo.numero === 'string' ? corpo.numero.trim() : ''
  const consultaToken = typeof corpo.consulta_token === 'string'
    ? corpo.consulta_token.trim()
    : ''

  if (!/^PED-[0-9]+$/.test(numero) || !consultaToken) {
    return responder(400, { sucesso: false }, origem)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: pedido, error: erroPedido } = await adminClient.rpc(
    'obter_pedido_pagamento',
    { p_numero: numero, p_consulta_token: consultaToken },
  )

  if (erroPedido || !eObjeto(pedido)) {
    return responder(404, { sucesso: false, mensagem: 'Pedido não encontrado.' }, origem)
  }

  if (!pedido.pagamento_id) {
    return responder(200, { sucesso: true, pedido }, origem)
  }

  const respostaOrder = await fetch(
    `https://api.mercadopago.com/v1/orders/${encodeURIComponent(String(pedido.pagamento_id))}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!respostaOrder.ok) {
    return responder(503, {
      sucesso: false,
      mensagem: 'Não foi possível atualizar o pagamento agora.',
    }, origem)
  }

  const order: unknown = await respostaOrder.json()
  if (!eObjeto(order)) return responder(503, { sucesso: false }, origem)

  const pagamento = primeiroPagamento(order)
  const totalProviderRaw =
    order.total_amount ??
    order.transaction_amount ??
    pagamento?.transaction_amount ??
    pagamento?.total_paid_amount

  const totalProvider = Number.isFinite(Number(totalProviderRaw))
    ? Number(totalProviderRaw)
    : null

  const { data: atualizado, error: erroAtualizacao } = await adminClient.rpc(
    'registrar_resultado_pagamento',
    {
      p_pedido_id: Number(pedido.id),
      p_pagamento_id: String(order.id),
      p_external_reference: String(order.external_reference || ''),
      p_status_provider: String(pagamento?.status || order.status || ''),
      p_status_detail: String(pagamento?.status_detail || order.status_detail || ''),
      p_total_provider: totalProvider,
      p_pix_expiracao: null,
    },
  )

  if (erroAtualizacao || !eObjeto(atualizado)) {
    return responder(503, { sucesso: false }, origem)
  }

  const metodo = pagamento && eObjeto(pagamento.payment_method)
    ? pagamento.payment_method
    : null

  return responder(200, {
    sucesso: true,
    pedido: atualizado,
    pagamento: {
      status: pagamento?.status || order.status,
      status_detail: pagamento?.status_detail || order.status_detail,
      qr_code: metodo?.qr_code || null,
      qr_code_base64: metodo?.qr_code_base64 || null,
      ticket_url: metodo?.ticket_url || null,
    },
  }, origem)
})
