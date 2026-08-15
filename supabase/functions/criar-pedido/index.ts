import { createClient } from 'npm:@supabase/supabase-js@2.112.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

const MAX_BODY_BYTES = 64 * 1024
const MAX_ITENS = 50
const MAX_QUANTIDADE_POR_ITEM = 100

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CAMPOS_PROIBIDOS_PEDIDO = [
  'user_id',
  'p_user_id',
  'preco',
  'subtotal',
  'desconto',
  'total',
  'status',
  'estoque',
  'estoque_final',
  'frete',
  'valor_frete',
  'regiao_frete',
]

const CAMPOS_PROIBIDOS_ITEM = [
  'preco',
  'venda',
  'subtotal',
  'desconto',
  'total',
  'estoque',
  'estoque_final',
]

type JsonObject = Record<string, unknown>

type ItemRpc = {
  produto_id: number
  tamanho: string | null
  quantidade: number
}

type EnderecoEntrega = {
  cep: string
  endereco: string
  numero: string
  complemento: string | null
  bairro: string
  cidade: string
  estado: string
}

type PayloadValidado = {
  email: string
  nomeCliente: string
  itens: ItemRpc[]
  cupom: string | null
  idempotencyKey: string
  entrega: EnderecoEntrega
}

type ErroValidacao = {
  mensagem: string
}

type ErroRpc = {
  code?: string
  message?: string
}

function responder(
  status: number,
  corpo: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...jsonHeaders,
      ...headers,
    },
  })
}

function eObjeto(valor: unknown): valor is JsonObject {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    !Array.isArray(valor)
  )
}

function possuiCampo(
  objeto: JsonObject,
  campo: string,
) {
  return Object.prototype.hasOwnProperty.call(objeto, campo)
}

function normalizarTexto(
  valor: unknown,
  limite: number,
) {
  if (typeof valor !== 'string') {
    return null
  }

  const texto = valor.trim()

  if (!texto || texto.length > limite) {
    return null
  }

  return texto
}

function normalizarCep(valor: unknown) {
  if (typeof valor !== 'string') {
    return ''
  }

  return valor.replace(/\D/g, '').slice(0, 8)
}

function validarEnderecoEntrega(
  valor: unknown,
): EnderecoEntrega | ErroValidacao {
  if (!eObjeto(valor)) {
    return { mensagem: 'Os dados de entrega são obrigatórios.' }
  }

  const cep = normalizarCep(valor.cep)
  const endereco = normalizarTexto(valor.endereco, 300)
  const numero = normalizarTexto(valor.numero, 30)
  const bairro = normalizarTexto(valor.bairro, 150)
  const cidade = normalizarTexto(valor.cidade, 150)
  const estado = normalizarTexto(valor.estado, 2)?.toUpperCase() || ''
  const complemento =
    valor.complemento === null ||
    valor.complemento === undefined ||
    valor.complemento === ''
      ? null
      : normalizarTexto(valor.complemento, 150)

  if (
    !/^[0-9]{8}$/.test(cep) ||
    !endereco ||
    !numero ||
    !bairro ||
    !cidade ||
    !/^[A-Z]{2}$/.test(estado) ||
    (valor.complemento && !complemento)
  ) {
    return { mensagem: 'O endereço de entrega está incompleto ou inválido.' }
  }

  return {
    cep,
    endereco,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
  }
}

async function consultarEstadoDoCep(cep: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const resposta = await fetch(
      `https://viacep.com.br/ws/${cep}/json/`,
      { signal: controller.signal },
    )

    if (!resposta.ok) {
      throw new Error('Falha ao consultar o CEP.')
    }

    const dados: unknown = await resposta.json()

    if (
      !eObjeto(dados) ||
      dados.erro === true ||
      dados.erro === 'true'
    ) {
      return null
    }

    const estado = normalizarTexto(dados.uf, 2)?.toUpperCase() || ''
    return /^[A-Z]{2}$/.test(estado) ? estado : null
  } finally {
    clearTimeout(timeout)
  }
}

function validarPayload(
  corpo: unknown,
): PayloadValidado | ErroValidacao {
  if (!eObjeto(corpo)) {
    return { mensagem: 'O corpo da requisição deve ser um objeto JSON.' }
  }

  if (
    CAMPOS_PROIBIDOS_PEDIDO.some((campo) =>
      possuiCampo(corpo, campo)
    )
  ) {
    return {
      mensagem:
        'O pedido contém campos calculados ou protegidos que não são aceitos.',
    }
  }

  if (!eObjeto(corpo.cliente)) {
    return { mensagem: 'Os dados da cliente são obrigatórios.' }
  }

  const nomeCliente = normalizarTexto(
    corpo.cliente.nome,
    200,
  )

  if (!nomeCliente) {
    return { mensagem: 'Informe o nome completo da cliente.' }
  }

  const email = normalizarTexto(corpo.email, 254) || ''

  if (!Array.isArray(corpo.itens)) {
    return { mensagem: 'Os itens do pedido devem ser uma lista.' }
  }

  if (corpo.itens.length === 0) {
    return { mensagem: 'O carrinho está vazio.' }
  }

  if (corpo.itens.length > MAX_ITENS) {
    return {
      mensagem: `O carrinho não pode ter mais de ${MAX_ITENS} itens.`,
    }
  }

  const itens: ItemRpc[] = []

  for (let indice = 0; indice < corpo.itens.length; indice += 1) {
    const item = corpo.itens[indice]

    if (!eObjeto(item)) {
      return { mensagem: `O item ${indice + 1} é inválido.` }
    }

    if (
      CAMPOS_PROIBIDOS_ITEM.some((campo) =>
        possuiCampo(item, campo)
      )
    ) {
      return {
        mensagem: `O item ${indice + 1} contém campos calculados não aceitos.`,
      }
    }

    if (
      typeof item.produto_id !== 'number' ||
      !Number.isSafeInteger(item.produto_id) ||
      item.produto_id <= 0
    ) {
      return {
        mensagem: `O produto_id do item ${indice + 1} é inválido.`,
      }
    }

    if (
      typeof item.quantidade !== 'number' ||
      !Number.isInteger(item.quantidade) ||
      item.quantidade < 1 ||
      item.quantidade > MAX_QUANTIDADE_POR_ITEM
    ) {
      return {
        mensagem:
          `A quantidade do item ${indice + 1} deve estar entre 1 e ` +
          `${MAX_QUANTIDADE_POR_ITEM}.`,
      }
    }

    if (
      item.tamanho !== null &&
      item.tamanho !== undefined &&
      typeof item.tamanho !== 'string'
    ) {
      return {
        mensagem: `O tamanho do item ${indice + 1} é inválido.`,
      }
    }

    const tamanho =
      typeof item.tamanho === 'string'
        ? item.tamanho.trim()
        : ''

    if (tamanho.length > 80) {
      return {
        mensagem: `O tamanho do item ${indice + 1} é inválido.`,
      }
    }

    itens.push({
      produto_id: item.produto_id,
      tamanho: tamanho || null,
      quantidade: item.quantidade,
    })
  }

  if (
    corpo.cupom !== null &&
    corpo.cupom !== undefined &&
    typeof corpo.cupom !== 'string'
  ) {
    return { mensagem: 'O cupom informado é inválido.' }
  }

  const cupom =
    typeof corpo.cupom === 'string'
      ? corpo.cupom.trim().toUpperCase()
      : ''

  if (cupom.length > 50) {
    return { mensagem: 'O cupom informado é inválido.' }
  }

  if (
    typeof corpo.idempotency_key !== 'string' ||
    !UUID_PATTERN.test(corpo.idempotency_key)
  ) {
    return { mensagem: 'A idempotency_key deve ser um UUID válido.' }
  }

  const entrega = validarEnderecoEntrega(corpo.cliente.endereco)

  if ('mensagem' in entrega) {
    return entrega
  }

  return {
    email,
    nomeCliente,
    itens,
    cupom: cupom || null,
    idempotencyKey: corpo.idempotency_key.toLowerCase(),
    entrega,
  }
}

function mensagemRpcSegura(erro: ErroRpc) {
  const mensagem = (erro.message || '').toLowerCase()

  if (mensagem.includes('estoque')) {
    return 'Estoque insuficiente para concluir o pedido.'
  }

  if (
    mensagem.includes('tamanho') ||
    mensagem.includes('selecione um tamanho')
  ) {
    return 'Selecione um tamanho disponível para o produto.'
  }

  if (mensagem.includes('cupom')) {
    return 'O cupom informado é inválido.'
  }

  if (mensagem.includes('idempotency_key')) {
    return 'Esta tentativa de pedido já foi utilizada com dados diferentes.'
  }

  if (
    mensagem.includes('frete') ||
    mensagem.includes('entrega') ||
    mensagem.includes('endereço')
  ) {
    return 'Consulte o frete ou confira o endereço de entrega.'
  }

  if (mensagem.includes('produto') && mensagem.includes('não encontrado')) {
    return 'Um dos produtos não está mais disponível.'
  }

  if (
    mensagem.includes('carrinho') ||
    mensagem.includes('quantidade') ||
    mensagem.includes('item duplicado') ||
    mensagem.includes('itens duplicados') ||
    mensagem.includes('cliente') ||
    mensagem.includes('e-mail')
  ) {
    return 'Os dados enviados para o pedido são inválidos.'
  }

  return 'Não foi possível registrar o pedido.'
}

function statusErroRpc(erro: ErroRpc) {
  if (erro.code === '22023') {
    return 400
  }

  if (
    erro.code === 'P0001' ||
    erro.code === '23503' ||
    erro.code === '23505' ||
    erro.code === '23514'
  ) {
    return 409
  }

  return 500
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  if (request.method !== 'POST') {
    return responder(
      405,
      {
        sucesso: false,
        mensagem: 'Método não permitido.',
      },
      { Allow: 'POST, OPTIONS' },
    )
  }

  const contentType = request.headers.get('content-type') || ''

  if (!contentType.toLowerCase().includes('application/json')) {
    return responder(400, {
      sucesso: false,
      mensagem: 'O Content-Type deve ser application/json.',
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const supabaseServiceRoleKey = Deno.env.get(
    'SUPABASE_SERVICE_ROLE_KEY',
  )

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !supabaseServiceRoleKey
  ) {
    console.error('criar-pedido: configuração obrigatória ausente')

    return responder(500, {
      sucesso: false,
      mensagem: 'Serviço temporariamente indisponível.',
    })
  }

  const contentLength = Number(
    request.headers.get('content-length') || 0,
  )

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_BODY_BYTES
  ) {
    return responder(400, {
      sucesso: false,
      mensagem: 'O corpo da requisição excede o limite permitido.',
    })
  }

  let corpo: unknown

  try {
    const texto = await request.text()
    const tamanhoEmBytes = new TextEncoder().encode(texto).byteLength

    if (tamanhoEmBytes > MAX_BODY_BYTES) {
      return responder(400, {
        sucesso: false,
        mensagem: 'O corpo da requisição excede o limite permitido.',
      })
    }

    corpo = JSON.parse(texto)
  } catch {
    return responder(400, {
      sucesso: false,
      mensagem: 'O corpo da requisição não contém um JSON válido.',
    })
  }

  const payload = validarPayload(corpo)

  if ('mensagem' in payload) {
    return responder(400, {
      sucesso: false,
      mensagem: payload.mensagem,
    })
  }

  const authClient = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  )

  let userId: string | null = null
  let emailCliente = payload.email
  const authorization = request.headers.get('authorization')

  if (authorization !== null) {
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)

    if (!bearer?.[1]) {
      return responder(401, {
        sucesso: false,
        mensagem: 'Token de autenticação inválido.',
      })
    }

    const token = bearer[1].trim()
    const { data, error } = await authClient.auth.getUser(token)

    if (error || !data.user) {
      return responder(401, {
        sucesso: false,
        mensagem: 'Token de autenticação inválido ou expirado.',
      })
    }

    userId = data.user.id

    if (data.user.email) {
      emailCliente = data.user.email.trim()
    }
  }

  if (!EMAIL_PATTERN.test(emailCliente) || emailCliente.length > 254) {
    return responder(400, {
      sucesso: false,
      mensagem: 'Informe um e-mail válido.',
    })
  }

  let estadoConfirmado: string | null

  try {
    estadoConfirmado = await consultarEstadoDoCep(payload.entrega.cep)
  } catch {
    return responder(503, {
      sucesso: false,
      mensagem:
        'Não foi possível validar o CEP agora. Tente novamente em instantes.',
    })
  }

  if (!estadoConfirmado) {
    return responder(400, {
      sucesso: false,
      mensagem: 'O CEP informado não foi encontrado.',
    })
  }

  const entregaConfirmada = {
    ...payload.entrega,
    estado: estadoConfirmado,
  }

  // TODO: adicionar CAPTCHA e rate limit persistente antes da abertura
  // pública em produção. Esta etapa ainda não oferece rate limit real.

  const adminClient = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  )

  const requestId = crypto.randomUUID()

  try {
    const { data, error } = await adminClient.rpc(
      'criar_pedido_checkout',
      {
        p_user_id: userId,
        p_email_cliente: emailCliente,
        p_cliente: payload.nomeCliente,
        p_itens: payload.itens,
        p_cupom: payload.cupom,
        p_idempotency_key: payload.idempotencyKey,
        p_entrega: entregaConfirmada,
      },
    )

    if (error) {
      const status = statusErroRpc(error)

      console.error('criar-pedido: falha na RPC', {
        requestId,
        code: error.code || 'unknown',
      })

      return responder(status, {
        sucesso: false,
        mensagem: mensagemRpcSegura(error),
      })
    }

    return responder(200, {
      sucesso: true,
      pedido: data,
    })
  } catch {
    console.error('criar-pedido: erro interno inesperado', {
      requestId,
    })

    return responder(500, {
      sucesso: false,
      mensagem: 'Não foi possível registrar o pedido.',
    })
  }
})
