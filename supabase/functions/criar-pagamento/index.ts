import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import {
  obterAmbienteMercadoPago,
  usarPagadorSintetico,
} from './environment.ts'
import { extrairResultadoRecusaMercadoPago } from './mercadoPagoRecusa.ts'
import {
  anonimizarRateLimit,
  criarRegrasRateLimit,
  obterIpCliente,
} from './rateLimit.ts'

const ORIGENS_PADRAO = [
  'https://bazar-encanto-feminino.vercel.app',
  'http://localhost:5173',
]

const MAX_BODY_BYTES = 64 * 1024
const MAX_ITENS = 50
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type JsonObject = Record<string, unknown>

type ItemCheckout = {
  produto_id: number
  tamanho: string | null
  quantidade: number
}

type Entrega = {
  cep: string
  endereco: string
  numero: string
  complemento: string | null
  bairro: string
  cidade: string
  estado: string
}

type CartaoTokenizado = {
  token: string
  paymentMethodId: string
  paymentTypeId: 'credit_card' | 'debit_card'
  installments: number
}

type Payload = {
  email: string
  nomeCliente: string
  itens: ItemCheckout[]
  cupom: string | null
  idempotencyKey: string
  formaPagamento: 'Pix' | 'Cartão de crédito'
  entrega: Entrega
  cartao: CartaoTokenizado | null
}

function eObjeto(valor: unknown): valor is JsonObject {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function normalizarTexto(valor: unknown, limite: number) {
  if (typeof valor !== 'string') return null
  const texto = valor.trim()
  return texto && texto.length <= limite ? texto : null
}

function origensPermitidas() {
  const configuradas = Deno.env.get('CHECKOUT_ALLOWED_ORIGINS')
    ?.split(',')
    .map((origem) => origem.trim())
    .filter(Boolean)

  return configuradas?.length ? configuradas : ORIGENS_PADRAO
}

function corsHeaders(request: Request) {
  const origem = request.headers.get('origin') || ''
  const permitida = origensPermitidas().includes(origem)

  return {
    'Access-Control-Allow-Origin': permitida ? origem : ORIGENS_PADRAO[0],
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function origemPermitida(request: Request) {
  const origem = request.headers.get('origin')
  return !origem || origensPermitidas().includes(origem)
}

function responder(
  request: Request,
  status: number,
  corpo: Record<string, unknown>,
  headersAdicionais: Record<string, string> = {},
) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...corsHeaders(request),
      ...headersAdicionais,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function validarEntrega(valor: unknown): Entrega | string {
  if (!eObjeto(valor)) return 'Os dados de entrega são obrigatórios.'

  const cep = String(valor.cep || '').replace(/\D/g, '').slice(0, 8)
  const endereco = normalizarTexto(valor.endereco, 300)
  const numero = normalizarTexto(valor.numero, 30)
  const bairro = normalizarTexto(valor.bairro, 150)
  const cidade = normalizarTexto(valor.cidade, 150)
  const estado = normalizarTexto(valor.estado, 2)?.toUpperCase() || ''
  const complemento = valor.complemento
    ? normalizarTexto(valor.complemento, 150)
    : null

  if (
    !/^[0-9]{8}$/.test(cep) ||
    !endereco ||
    !numero ||
    !bairro ||
    !cidade ||
    !/^[A-Z]{2}$/.test(estado) ||
    (valor.complemento && !complemento)
  ) {
    return 'O endereço de entrega está incompleto ou inválido.'
  }

  return { cep, endereco, numero, complemento, bairro, cidade, estado }
}

function validarCartao(valor: unknown): CartaoTokenizado | string {
  if (!eObjeto(valor)) return 'Os dados tokenizados do cartão são obrigatórios.'

  const token = normalizarTexto(valor.token, 300)
  const paymentMethodId = normalizarTexto(valor.payment_method_id, 80)
  const paymentTypeId = normalizarTexto(valor.payment_type_id, 30)
  const installments = Number(valor.installments)

  if (
    !token ||
    !paymentMethodId ||
    !['credit_card', 'debit_card'].includes(paymentTypeId || '') ||
    !Number.isInteger(installments) ||
    installments < 1 ||
    installments > 24
  ) {
    return 'Os dados tokenizados do cartão são inválidos.'
  }

  return {
    token,
    paymentMethodId,
    paymentTypeId: paymentTypeId as 'credit_card' | 'debit_card',
    installments,
  }
}

function validarPayload(corpo: unknown): Payload | string {
  if (!eObjeto(corpo) || !eObjeto(corpo.cliente)) {
    return 'Os dados da cliente são obrigatórios.'
  }

  const email = normalizarTexto(corpo.email, 254) || ''
  const nomeCliente = normalizarTexto(corpo.cliente.nome, 200)
  const formaPagamento = normalizarTexto(corpo.forma_pagamento, 30)

  if (!EMAIL_PATTERN.test(email) || !nomeCliente) {
    return 'Informe nome e e-mail válidos.'
  }

  if (!['Pix', 'Cartão de crédito'].includes(formaPagamento || '')) {
    return 'Forma de pagamento inválida.'
  }

  if (
    typeof corpo.idempotency_key !== 'string' ||
    !UUID_PATTERN.test(corpo.idempotency_key)
  ) {
    return 'A idempotency_key deve ser um UUID válido.'
  }

  if (
    !Array.isArray(corpo.itens) ||
    corpo.itens.length === 0 ||
    corpo.itens.length > MAX_ITENS
  ) {
    return 'O carrinho deve conter entre 1 e 50 itens.'
  }

  const itens: ItemCheckout[] = []
  const chaves = new Set<string>()

  for (const [indice, valor] of corpo.itens.entries()) {
    if (!eObjeto(valor)) return `O item ${indice + 1} é inválido.`

    const produtoId = Number(valor.produto_id)
    const quantidade = Number(valor.quantidade)
    const tamanho = typeof valor.tamanho === 'string'
      ? valor.tamanho.trim()
      : ''

    if (
      !Number.isSafeInteger(produtoId) ||
      produtoId <= 0 ||
      !Number.isInteger(quantidade) ||
      quantidade < 1 ||
      quantidade > 100 ||
      tamanho.length > 80
    ) {
      return `O item ${indice + 1} é inválido.`
    }

    const chave = `${produtoId}:${tamanho.toUpperCase()}`
    if (chaves.has(chave)) return 'O carrinho contém itens duplicados.'
    chaves.add(chave)

    itens.push({
      produto_id: produtoId,
      tamanho: tamanho || null,
      quantidade,
    })
  }

  const entrega = validarEntrega(corpo.cliente.endereco)
  if (typeof entrega === 'string') return entrega

  let cartao: CartaoTokenizado | null = null
  if (formaPagamento === 'Cartão de crédito') {
    const validacaoCartao = validarCartao(corpo.cartao)
    if (typeof validacaoCartao === 'string') return validacaoCartao
    cartao = validacaoCartao
  }

  const cupom = typeof corpo.cupom === 'string'
    ? corpo.cupom.trim().toUpperCase()
    : ''

  if (cupom.length > 50) return 'O cupom informado é inválido.'

  return {
    email,
    nomeCliente,
    itens,
    cupom: cupom || null,
    idempotencyKey: corpo.idempotency_key.toLowerCase(),
    formaPagamento: formaPagamento as Payload['formaPagamento'],
    entrega,
    cartao,
  }
}

async function confirmarEstadoCep(cep: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controller.signal,
    })
    if (!resposta.ok) throw new Error('Falha ao consultar CEP')
    const dados: unknown = await resposta.json()
    if (!eObjeto(dados) || dados.erro === true || dados.erro === 'true') return null
    const uf = normalizarTexto(dados.uf, 2)?.toUpperCase() || ''
    return /^[A-Z]{2}$/.test(uf) ? uf : null
  } finally {
    clearTimeout(timeout)
  }
}

function primeiroPagamento(order: JsonObject) {
  const transactions = eObjeto(order.transactions) ? order.transactions : null
  const payments = transactions && Array.isArray(transactions.payments)
    ? transactions.payments
    : []
  return eObjeto(payments[0]) ? payments[0] : null
}

function mensagemMercadoPago(status: number) {
  if (status === 401 || status === 403) return 'Pagamento indisponível por configuração.'
  if (status === 429) return 'Muitas tentativas. Aguarde e tente novamente.'
  if (status === 402) return 'O pagamento não foi aprovado.'
  if (status >= 500) return 'O Mercado Pago está temporariamente indisponível.'
  return 'Não foi possível processar o pagamento.'
}

function textoSeguroMercadoPago(valor: unknown, limite = 180) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null

  const texto = String(valor)
    .replace(/Bearer\s+\S+/gi, 'Bearer [removido]')
    .replace(/\b(?:TEST|APP_USR)-[A-Za-z0-9_-]+\b/gi, '[credencial removida]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[e-mail removido]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[dado removido]')
    .replace(/\s+/g, ' ')
    .trim()

  return texto ? texto.slice(0, limite) : null
}

function codigoSeguroMercadoPago(valor: unknown) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null

  const codigo = String(valor)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return codigo ? codigo.slice(0, 60) : null
}

function detalheCausaMercadoPago(valor: unknown) {
  const causas = Array.isArray(valor) ? valor.slice(0, 3) : [valor]
  const detalhes = causas.flatMap((causa) => {
    if (eObjeto(causa)) {
      const codigo = codigoSeguroMercadoPago(causa.code)
      const mensagem = textoSeguroMercadoPago(
        causa.message ?? causa.description ?? causa.cause,
        120,
      )

      return codigo || mensagem
        ? [`${codigo ? `${codigo}: ` : ''}${mensagem || 'erro informado'}`]
        : []
    }

    const mensagem = textoSeguroMercadoPago(causa, 120)
    return mensagem ? [mensagem] : []
  })

  return detalhes.length ? detalhes.join(' | ').slice(0, 240) : null
}

function extrairErroMercadoPago(corpo: unknown, textoOriginal: string) {
  const erroObjeto = eObjeto(corpo) && eObjeto(corpo.error) ? corpo.error : null
  const causas = eObjeto(corpo)
    ? corpo.cause ?? corpo.causes ?? corpo.errors ?? erroObjeto?.cause
      ?? erroObjeto?.causes ?? erroObjeto?.errors
    : null

  return {
    status: eObjeto(corpo)
      ? codigoSeguroMercadoPago(corpo.status ?? erroObjeto?.status)
      : null,
    code: eObjeto(corpo)
      ? codigoSeguroMercadoPago(corpo.code ?? erroObjeto?.code)
        ?? (Array.isArray(causas) && eObjeto(causas[0])
          ? codigoSeguroMercadoPago(causas[0].code)
          : null)
      : null,
    message: eObjeto(corpo)
      ? textoSeguroMercadoPago(
        corpo.message
          ?? (typeof corpo.error === 'string' ? corpo.error : erroObjeto?.message),
      )
      : textoSeguroMercadoPago(textoOriginal),
    cause: detalheCausaMercadoPago(causas),
  }
}

function detalhePagamentoMercadoPago(
  httpStatus: number,
  status: string | null,
  code: string | null,
) {
  const partes = [status, code].filter(Boolean)
  return partes.length
    ? `mp_${partes.join('_')}`.slice(0, 120)
    : `http_${httpStatus}`
}

Deno.serve(async (request) => {
  if (!origemPermitida(request)) {
    return responder(request, 403, {
      sucesso: false,
      mensagem: 'Origem não permitida.',
    })
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) })
  }

  if (request.method !== 'POST') {
    return responder(request, 405, { sucesso: false, mensagem: 'Método não permitido.' })
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return responder(request, 400, { sucesso: false, mensagem: 'Payload muito grande.' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const mercadoPagoToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
  const ambienteMercadoPago = obterAmbienteMercadoPago(
    Deno.env.get('MERCADO_PAGO_ENVIRONMENT') ||
    Deno.env.get('MERCADO_PAGO_AMBIENTE'),
  )

  if (
    !supabaseUrl ||
    !anonKey ||
    !serviceRoleKey ||
    !mercadoPagoToken ||
    !ambienteMercadoPago
  ) {
    return responder(request, 503, {
      sucesso: false,
      mensagem: 'Pagamento ainda não configurado no ambiente.',
    })
  }

  let corpo: unknown
  try {
    const texto = await request.text()
    if (new TextEncoder().encode(texto).byteLength > MAX_BODY_BYTES) {
      return responder(request, 400, { sucesso: false, mensagem: 'Payload muito grande.' })
    }
    corpo = JSON.parse(texto)
  } catch {
    return responder(request, 400, { sucesso: false, mensagem: 'JSON inválido.' })
  }

  const payload = validarPayload(corpo)
  if (typeof payload === 'string') {
    return responder(request, 400, { sucesso: false, mensagem: payload })
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let userId: string | null = null
  let emailCliente = payload.email
  const authorization = request.headers.get('authorization')

  if (authorization) {
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)
    const token = bearer?.[1]?.trim()
    if (token && token !== anonKey) {
      const { data, error } = await authClient.auth.getUser(token)
      if (error || !data.user) {
        return responder(request, 401, { sucesso: false, mensagem: 'Token inválido ou expirado.' })
      }
      userId = data.user.id
      emailCliente = data.user.email?.trim() || emailCliente
    }
  }

  const eventoHash = await anonimizarRateLimit(
    serviceRoleKey,
    'evento',
    payload.idempotencyKey,
  )
  const regrasRateLimit = criarRegrasRateLimit({
    ip: obterIpCliente(request),
    email: emailCliente,
    userId,
    pix: payload.formaPagamento === 'Pix',
  })

  for (const regra of regrasRateLimit) {
    const identidadeHash = await anonimizarRateLimit(
      serviceRoleKey,
      regra.escopo,
      regra.identidade,
    )
    const { data: limite, error: erroLimite } = await adminClient.rpc(
      'consumir_rate_limit_checkout',
      {
        p_escopo: regra.escopo,
        p_identidade_hash: identidadeHash,
        p_evento_hash: eventoHash,
      },
    )

    if (erroLimite || !eObjeto(limite)) {
      console.error('criar-pagamento: falha ao verificar rate limit', {
        code: erroLimite?.code || 'invalid_response',
      })
      return responder(request, 503, {
        sucesso: false,
        mensagem: 'Checkout temporariamente indisponível. Tente novamente.',
      })
    }

    if (limite.permitido !== true) {
      const retryAfter = Math.max(
        1,
        Math.min(3600, Number(limite.retry_after) || 60),
      )
      return responder(
        request,
        429,
        {
          sucesso: false,
          codigo: 'rate_limit_exceeded',
          mensagem: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        },
        { 'Retry-After': String(retryAfter) },
      )
    }
  }

  let estado: string | null
  try {
    estado = await confirmarEstadoCep(payload.entrega.cep)
  } catch {
    return responder(request, 503, {
      sucesso: false,
      mensagem: 'Não foi possível validar o CEP agora.',
    })
  }

  if (!estado) {
    return responder(request, 400, { sucesso: false, mensagem: 'CEP não encontrado.' })
  }

  const { data: pedido, error: erroPedido } = await adminClient.rpc(
    'criar_pedido_pagamento',
    {
      p_user_id: userId,
      p_email_cliente: emailCliente,
      p_cliente: payload.nomeCliente,
      p_itens: payload.itens,
      p_cupom: payload.cupom,
      p_idempotency_key: payload.idempotencyKey,
      p_entrega: { ...payload.entrega, estado },
      p_forma_pagamento: payload.formaPagamento,
    },
  )

  if (erroPedido || !eObjeto(pedido)) {
    const mensagemPedido = erroPedido?.message?.toLowerCase() || ''
    const conflitoIdempotencia =
      mensagemPedido.includes('idempotency_context_mismatch') ||
      mensagemPedido.includes('idempotency_key')

    console.error('criar-pagamento: falha ao reservar pedido', {
      code: erroPedido?.code || 'invalid_response',
      message: erroPedido?.message,
      details: erroPedido?.details,
      hint: erroPedido?.hint,
    })
    return responder(request, 409, {
      sucesso: false,
      codigo: conflitoIdempotencia
        ? 'idempotency_context_mismatch'
        : undefined,
      mensagem: mensagemPedido.includes('estoque')
        ? 'Estoque insuficiente para concluir o pedido.'
        : conflitoIdempotencia
          ? 'Os dados desta tentativa foram alterados. Tente finalizar novamente.'
          : 'Não foi possível reservar o pedido.',
      requer_nova_tentativa: conflitoIdempotencia,
    })
  }

  if (pedido.pagamento_id) {
    return responder(request, 200, { sucesso: true, pedido })
  }

  const total = Number(pedido.total)
  const pedidoId = Number(pedido.id)
  const externalReference = String(pedido.pagamento_external_reference || pedido.numero)
  const valor = total.toFixed(2)

  const partesNome = (payload.nomeCliente || '').trim().split(/\s+/).filter(Boolean)
  const firstName = partesNome[0] || 'Cliente'
  const lastName = partesNome.slice(1).join(' ') || partesNome[0] || 'Cliente'

  const paymentMethod = payload.formaPagamento === 'Pix'
    ? { id: 'pix', type: 'bank_transfer' }
    : {
        id: payload.cartao!.paymentMethodId,
        type: payload.cartao!.paymentTypeId,
        token: payload.cartao!.token,
        installments: payload.cartao!.installments,
      }

  const orderBody: JsonObject = {
    type: 'online',
    processing_mode: 'automatic',
    total_amount: valor,
    external_reference: externalReference,
    payer: usarPagadorSintetico(ambienteMercadoPago)
      ? {
          email: 'test_user_br@testuser.com',
          first_name: 'APRO',
        }
      : {
          email: emailCliente,
          first_name: firstName,
          last_name: lastName,
        },
    transactions: {
      payments: [{
        amount: valor,
        payment_method: paymentMethod,
        ...(payload.formaPagamento === 'Pix' ? { expiration_time: 'PT30M' } : {}),
      }],
    },
  }

  let respostaMercadoPago: Response
  try {
    respostaMercadoPago = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mercadoPagoToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': payload.idempotencyKey,
      },
      body: JSON.stringify(orderBody),
    })
  } catch {
    return responder(request, 503, {
      sucesso: false,
      pedido,
      mensagem: 'Pagamento pendente de confirmação. Tente atualizar em instantes.',
    })
  }

  let order: unknown = null
  let respostaTexto = ''
  try {
    respostaTexto = await respostaMercadoPago.text()
    order = respostaTexto ? JSON.parse(respostaTexto) : null
  } catch {
    // A resposta sem JSON é tratada pelo status HTTP.
  }

  if (!respostaMercadoPago.ok || !eObjeto(order)) {
    const tentativaRecusada = [400, 402].includes(respostaMercadoPago.status)
    const erroMercadoPago = extrairErroMercadoPago(order, respostaTexto)
    const detalhePagamento = detalhePagamentoMercadoPago(
      respostaMercadoPago.status,
      erroMercadoPago.status,
      erroMercadoPago.code,
    )
    const resultadoRecusa = extrairResultadoRecusaMercadoPago(
      order,
      detalhePagamento,
    )
    const mpRequestId =
      respostaMercadoPago.headers.get('x-request-id') ||
      respostaMercadoPago.headers.get('x-meli-session-id') ||
      null

    console.error('Mercado Pago rejeitou criação:', {
      http_status: respostaMercadoPago.status,
      mp_request_id: mpRequestId,
      code: erroMercadoPago.code,
      message: erroMercadoPago.message,
      cause: erroMercadoPago.cause,
      status_detail: resultadoRecusa.statusDetail,
      order_id: resultadoRecusa.orderId,
      ambiente: ambienteMercadoPago,
    })

    if (tentativaRecusada) {
      await adminClient.rpc('registrar_resultado_pagamento', {
        p_pedido_id: pedidoId,
        p_pagamento_id: resultadoRecusa.orderId,
        p_external_reference: externalReference,
        p_status_provider: 'rejected',
        p_status_detail: resultadoRecusa.statusDetail,
        p_total_provider: total,
        p_pix_expiracao: null,
      })
    }

    const statusResposta = tentativaRecusada
      ? 200
      : respostaMercadoPago.status >= 500 || [401, 403, 429].includes(respostaMercadoPago.status)
        ? 503
        : 400

    return responder(request, statusResposta, {
      sucesso: false,
      mensagem:
        erroMercadoPago.message || mensagemMercadoPago(respostaMercadoPago.status),
      codigo: erroMercadoPago.code || resultadoRecusa.statusDetail || 'failed',
      detalhe: resultadoRecusa.statusDetail || erroMercadoPago.cause || null,
      mp_request_id: mpRequestId,
      requer_nova_tentativa: tentativaRecusada,
    })
  }

  const pagamento = primeiroPagamento(order)
  const statusProvider = String(pagamento?.status || order.status || '')
  const statusDetail = String(pagamento?.status_detail || order.status_detail || '')
  const pagamentoId = String(order.id || pagamento?.id || '')
  const pixExpiracao = payload.formaPagamento === 'Pix'
    ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
    : null

  const totalProviderRaw =
    order.total_amount ??
    order.transaction_amount ??
    pagamento?.transaction_amount ??
    pagamento?.total_paid_amount

  const totalProvider = Number.isFinite(Number(totalProviderRaw))
    ? Number(totalProviderRaw)
    : total

  const { data: pedidoAtualizado, error: erroAtualizacao } = await adminClient.rpc(
    'registrar_resultado_pagamento',
    {
      p_pedido_id: pedidoId,
      p_pagamento_id: pagamentoId,
      p_external_reference: String(order.external_reference || ''),
      p_status_provider: statusProvider,
      p_status_detail: statusDetail,
      p_total_provider: totalProvider,
      p_pix_expiracao: pixExpiracao,
    },
  )

  if (erroAtualizacao || !eObjeto(pedidoAtualizado)) {
    console.error('criar-pagamento: order criada, falha ao reconciliar', {
      pedidoId,
      code: erroAtualizacao?.code || 'invalid_response',
    })
    return responder(request, 503, {
      sucesso: false,
      pedido,
      mensagem: 'Pagamento recebido e aguardando confirmação automática.',
    })
  }

  const metodo = pagamento && eObjeto(pagamento.payment_method)
    ? pagamento.payment_method
    : null

  return responder(request, 200, {
    sucesso: true,
    pedido: pedidoAtualizado,
    pagamento: {
      id: pagamentoId,
      status: statusProvider,
      status_detail: statusDetail,
      qr_code: metodo?.qr_code || null,
      qr_code_base64: metodo?.qr_code_base64 || null,
      ticket_url: metodo?.ticket_url || null,
      expiracao: pixExpiracao,
    },
  })
})
