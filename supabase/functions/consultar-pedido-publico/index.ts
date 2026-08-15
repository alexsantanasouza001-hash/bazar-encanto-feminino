import { createClient } from 'npm:@supabase/supabase-js@2.112.2'

type JsonObject = Record<string, unknown>

const MAX_BODY_BYTES = 4 * 1024
const NUMERO_PATTERN = /^PED-[0-9]{1,20}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ORIGENS_PADRAO = [
  'https://bazar-encanto-feminino.vercel.app',
  'http://localhost:5173',
]

function eObjeto(valor: unknown): valor is JsonObject {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function origensPermitidas() {
  const configuradas = Deno.env.get('CHECKOUT_ALLOWED_ORIGINS')
    ?.split(',')
    .map((origem) => origem.trim())
    .filter(Boolean)
  return configuradas?.length ? configuradas : ORIGENS_PADRAO
}

function origemPermitida(request: Request) {
  const origem = request.headers.get('origin')
  return !origem || origensPermitidas().includes(origem)
}

function corsHeaders(request: Request): Record<string, string> {
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

function responder(
  request: Request,
  status: number,
  corpo: Record<string, unknown>,
  extras: Record<string, string> = {},
) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...corsHeaders(request),
      ...extras,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function primeiroIp(valor: string | null) {
  const ip = valor?.split(',')[0]?.trim() || ''
  return ip && ip.length <= 64 && !/[^0-9a-fA-F:.]/.test(ip) ? ip : null
}

function obterIp(request: Request) {
  return primeiroIp(request.headers.get('cf-connecting-ip'))
    || primeiroIp(request.headers.get('x-forwarded-for'))
    || primeiroIp(request.headers.get('x-real-ip'))
}

async function hmacHex(chave: string, valor: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const assinatura = await crypto.subtle.sign('HMAC', key, encoder.encode(valor))
  return Array.from(new Uint8Array(assinatura))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (request) => {
  if (!origemPermitida(request)) {
    return responder(request, 403, { sucesso: false, mensagem: 'Origem não permitida.' })
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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return responder(request, 503, { sucesso: false, mensagem: 'Consulta temporariamente indisponível.' })
  }

  let corpo: unknown
  try {
    const texto = await request.text()
    if (new TextEncoder().encode(texto).byteLength > MAX_BODY_BYTES) {
      return responder(request, 400, { sucesso: false, mensagem: 'Payload muito grande.' })
    }
    corpo = JSON.parse(texto)
  } catch {
    return responder(request, 400, { sucesso: false, mensagem: 'Dados inválidos.' })
  }

  const numero = eObjeto(corpo) && typeof corpo.numero === 'string'
    ? corpo.numero.trim().toUpperCase()
    : ''
  const email = eObjeto(corpo) && typeof corpo.email === 'string'
    ? corpo.email.trim().toLowerCase()
    : ''
  const mensagemGenerica = 'Pedido não encontrado ou dados inválidos.'

  if (!NUMERO_PATTERN.test(numero) || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return responder(request, 404, { sucesso: false, mensagem: mensagemGenerica })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const evento = await hmacHex(serviceRoleKey, `tracking:event:${crypto.randomUUID()}`)
  const regras = [
    ...(obterIp(request)
      ? [
          ['tracking_ip_5m', obterIp(request)!],
          ['tracking_ip_1h', obterIp(request)!],
        ]
      : []),
    ['tracking_lookup_15m', `${numero}:${email}`],
  ]

  for (const [escopo, identidade] of regras) {
    const identidadeHash = await hmacHex(serviceRoleKey, `tracking:${escopo}:${identidade}`)
    const { data, error } = await adminClient.rpc('consumir_rate_limit_checkout', {
      p_escopo: escopo,
      p_identidade_hash: identidadeHash,
      p_evento_hash: evento,
    })
    if (error || !eObjeto(data)) {
      console.error('consultar-pedido-publico: falha no rate limit', {
        code: error?.code || 'invalid_response',
      })
      return responder(request, 503, { sucesso: false, mensagem: 'Consulta temporariamente indisponível.' })
    }
    if (data.permitido !== true) {
      const retryAfter = Math.max(1, Math.min(3600, Number(data.retry_after) || 60))
      return responder(
        request,
        429,
        { sucesso: false, mensagem: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
        { 'Retry-After': String(retryAfter) },
      )
    }
  }

  const { data: pedido, error } = await adminClient.rpc('consultar_pedido_publico', {
    p_numero: numero,
    p_email: email,
  })

  if (error) {
    console.error('consultar-pedido-publico: falha na consulta', { code: error.code })
    return responder(request, 503, { sucesso: false, mensagem: 'Consulta temporariamente indisponível.' })
  }
  if (!eObjeto(pedido)) {
    return responder(request, 404, { sucesso: false, mensagem: mensagemGenerica })
  }

  return responder(request, 200, { sucesso: true, pedido })
})
