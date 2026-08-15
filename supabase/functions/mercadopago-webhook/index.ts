import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import {
  InvalidWebhookSignatureError,
  WebhookSignatureValidator,
} from 'npm:mercadopago@3.0.0'

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

function extrairComponentesAssinatura(xSignature: string) {
  let timestamp = ''
  let v1 = ''

  for (const parte of xSignature.split(',')) {
    const separador = parte.indexOf('=')
    if (separador === -1) continue

    const chave = parte.substring(0, separador).trim().toLowerCase()
    const valor = parte.substring(separador + 1).trim()
    if (chave === 'ts' && valor) timestamp = valor
    if (chave === 'v1' && valor) v1 = valor
  }

  return { timestamp, v1 }
}

function resposta(status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return resposta(405, { recebido: false })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
  const webhookSecret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET')

  if (!supabaseUrl || !serviceRoleKey || !accessToken || !webhookSecret) {
    console.error('mercadopago-webhook: configuração obrigatória ausente')
    return resposta(503, { recebido: false })
  }

  const url = new URL(request.url)
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('data_id')
  const tipo = url.searchParams.get('type')
  const xSignature = request.headers.get('x-signature')
  const xRequestId = request.headers.get('x-request-id')

  if (!dataId || tipo !== 'order' || !xSignature || !xRequestId) {
    return resposta(400, { recebido: false })
  }

  let applicationIdNotificacao: string | number | null = null
  let liveModeNotificacao: boolean | null = null
  let tipoNotificacao: string | null = null
  let acaoNotificacao: string | null = null

  try {
    const corpo: unknown = await request.clone().json()
    if (eObjeto(corpo)) {
      applicationIdNotificacao =
        typeof corpo.application_id === 'string' ||
        typeof corpo.application_id === 'number'
          ? corpo.application_id
          : null
      liveModeNotificacao =
        typeof corpo.live_mode === 'boolean' ? corpo.live_mode : null
      tipoNotificacao = typeof corpo.type === 'string' ? corpo.type : null
      acaoNotificacao = typeof corpo.action === 'string' ? corpo.action : null
    }
  } catch {
    // O body não participa da validação da assinatura.
  }

  // O Mercado Pago exige data.id alfanumérico em minúsculas no manifesto HMAC.
  // O ID original continua sendo usado para consultar a Order após a validação.
  const dataIdAssinatura = /^[a-z0-9]+$/i.test(dataId)
    ? dataId.toLowerCase()
    : dataId
  const componentesAssinatura = extrairComponentesAssinatura(xSignature)
  const timestampAssinatura = componentesAssinatura.timestamp
  const manifestDebug = timestampAssinatura
    ? `id:${dataIdAssinatura};request-id:${xRequestId};ts:${timestampAssinatura};`
    : null

  try {
    WebhookSignatureValidator.validate({
      xSignature,
      xRequestId,
      dataId: dataIdAssinatura,
      secret: webhookSecret,
    })
  } catch (erro) {
    if (erro instanceof InvalidWebhookSignatureError) {
      if (erro.reason === 'SignatureMismatch') {
        console.error('mercadopago-webhook: SignatureMismatch', {
          x_signature_raw: xSignature,
          ts_parsed: componentesAssinatura.timestamp || null,
          v1_parsed: componentesAssinatura.v1 || null,
          x_request_id: xRequestId,
          data_id_query_original: dataId,
          data_id_normalizado: dataIdAssinatura,
          manifest_debug: manifestDebug,
          application_id: applicationIdNotificacao,
          live_mode: liveModeNotificacao,
          type: tipoNotificacao,
          action: acaoNotificacao,
        })
      } else {
        console.error('mercadopago-webhook: assinatura inválida', {
          signature_present: Boolean(xSignature),
          request_id_present: Boolean(xRequestId),
          timestamp: erro.timestamp || null,
          data_id: dataId,
          reason: erro.reason,
        })
      }
      return resposta(401, { recebido: false })
    }
    console.error('mercadopago-webhook: falha ao validar assinatura')
    return resposta(500, { recebido: false })
  }

  const respostaOrder = await fetch(
    `https://api.mercadopago.com/v1/orders/${encodeURIComponent(dataId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    },
  )

  if (!respostaOrder.ok) {
    console.error('mercadopago-webhook: falha ao consultar order', {
      status: respostaOrder.status,
    })
    return resposta(503, { recebido: false })
  }

  const order: unknown = await respostaOrder.json()
  if (!eObjeto(order)) return resposta(500, { recebido: false })

  const externalReference = String(order.external_reference || '')
  if (!externalReference) return resposta(200, { recebido: true })

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: pedido, error: erroPedido } = await adminClient
    .from('pedidos')
    .select('id')
    .eq('pagamento_external_reference', externalReference)
    .maybeSingle()

  if (erroPedido) {
    console.error('mercadopago-webhook: falha ao localizar pedido', {
      code: erroPedido.code,
    })
    return resposta(503, { recebido: false })
  }

  // Uma order válida de outra integração da mesma conta não pertence ao Bazar.
  if (!pedido) return resposta(200, { recebido: true })

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
      p_pagamento_id: String(order.id || dataId),
      p_external_reference: externalReference,
      p_status_provider: statusProvider,
      p_status_detail: statusDetail,
      p_total_provider: totalProvider,
      p_pix_expiracao: null,
    },
  )

  if (erroAtualizacao) {
    console.error('mercadopago-webhook: falha ao reconciliar pedido', {
      code: erroAtualizacao.code,
    })
    return resposta(503, { recebido: false })
  }

  // Resposta 200 impede reenvio; a atualização acima é idempotente.
  return resposta(200, { recebido: true })
})
