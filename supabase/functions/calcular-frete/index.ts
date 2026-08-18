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

const MAX_BODY_BYTES = 32 * 1024

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

function normalizarCep(valor: unknown): string {
  return String(valor || '').replace(/\D/g, '').slice(0, 8)
}

type ItemCotacao = {
  produto_id: number
  quantidade: number
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

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return responder(400, {
      sucesso: false,
      mensagem: 'O corpo da requisição excede o limite permitido.',
    })
  }

  let corpo: Record<string, unknown>
  try {
    const texto = await request.text()
    corpo = JSON.parse(texto)
  } catch {
    return responder(400, {
      sucesso: false,
      mensagem: 'O corpo da requisição não contém um JSON válido.',
    })
  }

  const cepDestino = normalizarCep(corpo.cep_destino || corpo.cep)
  if (cepDestino.length !== 8) {
    return responder(400, {
      sucesso: false,
      mensagem: 'Informe um CEP de destino válido com 8 dígitos.',
    })
  }

  const itensRaw = Array.isArray(corpo.itens) ? corpo.itens : []
  if (itensRaw.length === 0) {
    return responder(400, {
      sucesso: false,
      mensagem: 'Informe ao menos um produto para calcular o frete.',
    })
  }

  const itensValidados: ItemCotacao[] = []
  for (const item of itensRaw) {
    const produtoId = Number(item.produto_id || item.id)
    const quantidade = Math.max(1, Math.min(100, Math.floor(Number(item.quantidade || 1))))

    if (Number.isFinite(produtoId) && produtoId > 0) {
      itensValidados.push({ produto_id: produtoId, quantidade })
    }
  }

  if (itensValidados.length === 0) {
    return responder(400, {
      sucesso: false,
      mensagem: 'Nenhum item válido informado para cálculo.',
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const melhorEnvioToken = Deno.env.get('MELHOR_ENVIO_TOKEN')?.trim()
  const melhorEnvioCepOrigem = normalizarCep(Deno.env.get('MELHOR_ENVIO_CEP_ORIGEM'))
  const melhorEnvioAmbiente = Deno.env.get('MELHOR_ENVIO_AMBIENTE')?.trim().toLowerCase()

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return responder(500, {
      sucesso: false,
      mensagem: 'Serviço temporariamente indisponível.',
    })
  }

  if (!melhorEnvioToken || melhorEnvioCepOrigem.length !== 8) {
    return responder(503, {
      sucesso: false,
      configurado: false,
      mensagem: 'CEP de origem ou credenciais da loja não configuradas no Melhor Envio.',
    })
  }

  // Buscar dados reais dos produtos do banco de dados (não confiar nas dimensões do cliente)
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const idsUnicos = Array.from(new Set(itensValidados.map((i) => i.produto_id)))
  const { data: produtosBanco, error: erroProdutos } = await adminClient
    .from('produtos')
    .select('id, nome, peso_kg, altura_cm, largura_cm, comprimento_cm, venda, ativo')
    .in('id', idsUnicos)

  if (erroProdutos || !Array.isArray(produtosBanco)) {
    return responder(500, {
      sucesso: false,
      mensagem: 'Não foi possível consultar os dados dos produtos para o frete.',
    })
  }

  const mapaProdutos = new Map(produtosBanco.map((p) => [Number(p.id), p]))

  // Montar pacote para a API do Melhor Envio
  const produtosMelhorEnvio = []
  for (const item of itensValidados) {
    const prod = mapaProdutos.get(item.produto_id)
    if (!prod || prod.ativo === false) {
      continue
    }

    produtosMelhorEnvio.push({
      id: String(prod.id),
      width: Math.max(11, Number(prod.largura_cm || 20)),
      height: Math.max(2, Number(prod.altura_cm || 4)),
      length: Math.max(16, Number(prod.comprimento_cm || 25)),
      weight: Math.max(0.01, Number(prod.peso_kg || 0.300)),
      insurance_value: Math.max(1, Number(prod.venda || 10)),
      quantity: item.quantidade,
    })
  }

  if (produtosMelhorEnvio.length === 0) {
    return responder(400, {
      sucesso: false,
      mensagem: 'Os produtos selecionados não estão disponíveis para entrega.',
    })
  }

  const baseUrl =
    melhorEnvioAmbiente === 'sandbox'
      ? 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate'
      : 'https://melhorenvio.com.br/api/v2/me/shipment/calculate'

  try {
    const resposta = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${melhorEnvioToken}`,
        'User-Agent': 'BazarEncantoFeminino (contato@bazarencantofeminino.com.br)',
      },
      body: JSON.stringify({
        from: { postal_code: melhorEnvioCepOrigem },
        to: { postal_code: cepDestino },
        products: produtosMelhorEnvio,
      }),
    })

    if (!resposta.ok) {
      const textoErro = await resposta.text().catch(() => '')
      console.error('calcular-frete: erro na API Melhor Envio', {
        status: resposta.status,
        detalhe: textoErro.slice(0, 300),
      })

      return responder(502, {
        sucesso: false,
        mensagem: 'Não foi possível cotar o frete no momento. Tente novamente em instantes.',
      })
    }

    const opcoesRecebidas = await resposta.json()
    if (!Array.isArray(opcoesRecebidas)) {
      return responder(502, {
        sucesso: false,
        mensagem: 'Resposta inesperada da transportadora.',
      })
    }

    // Filtrar e normalizar serviços válidos sem erros
    const opcoesValidas = opcoesRecebidas
      .filter((opt) => {
        if (!opt || opt.error) return false
        const valor = Number(opt.custom_price || opt.price || 0)
        return Number.isFinite(valor) && valor > 0
      })
      .map((opt) => {
        const valor = Math.round((Number(opt.custom_price || opt.price || 0) + Number.EPSILON) * 100) / 100
        const diasMin = opt.delivery_range?.min ?? opt.custom_delivery_time ?? opt.delivery_time
        const diasMax = opt.delivery_range?.max ?? opt.custom_delivery_time ?? opt.delivery_time
        const prazoTexto =
          diasMin && diasMax && diasMin !== diasMax
            ? `${diasMin} a ${diasMax} dias úteis`
            : `${diasMax || 5} dias úteis`

        return {
          id: String(opt.id),
          transportadora: opt.company?.name || 'Correios',
          servico: opt.name || 'Entrega Expressa',
          prazo_dias: Number(diasMax || 5),
          prazo_texto: prazoTexto,
          valor,
        }
      })

    if (opcoesValidas.length === 0) {
      return responder(200, {
        sucesso: true,
        opcoes: [],
        mensagem: 'Nenhuma modalidade de entrega disponível para este CEP no momento.',
      })
    }

    return responder(200, {
      sucesso: true,
      opcoes: opcoesValidas,
    })
  } catch (err) {
    console.error('calcular-frete: falha inesperada', err)
    return responder(500, {
      sucesso: false,
      mensagem: 'Não foi possível calcular o frete agora. Tente novamente.',
    })
  }
})
