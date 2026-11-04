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

function responder(status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: jsonHeaders,
  })
}

type Payload = {
  pedido_id: number | string
  cliente?: string
  email?: string
  total?: number
  itens?: Array<{
    nome: string
    quantidade: number
    preco: number
  }>
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return responder(405, { sucesso: false, mensagem: 'Método não permitido.' })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return responder(401, { sucesso: false, mensagem: 'Autenticação necessária.' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')

  if (!supabaseUrl || !serviceRoleKey) {
    return responder(500, { sucesso: false, mensagem: 'Configuração do servidor incompleta.' })
  }

  let body: Payload
  try {
    body = await request.json()
  } catch {
    return responder(400, { sucesso: false, mensagem: 'Corpo da requisição inválido.' })
  }

  const pedidoId = Number(body.pedido_id)
  if (!pedidoId || pedidoId <= 0) {
    return responder(400, { sucesso: false, mensagem: 'pedido_id inválido.' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Verificar se o pedido já possui link gerado
  const { data: pedido, error: errPed } = await adminClient
    .from('pedidos')
    .select('id, numero, cliente, email_cliente, total, link_pagamento_mp')
    .eq('id', pedidoId)
    .single()

  if (errPed || !pedido) {
    return responder(404, { sucesso: false, mensagem: 'Pedido não encontrado.' })
  }

  if (pedido.link_pagamento_mp) {
    return responder(200, {
      sucesso: true,
      link: pedido.link_pagamento_mp,
      ja_existia: true,
    })
  }

  if (!mpAccessToken) {
    // Se o token do Mercado Pago não estiver configurado no ambiente, gera URL de checkout seguro com base no pedido
    const linkSimulado = `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=bazar-${pedido.numero}`
    await adminClient
      .from('pedidos')
      .update({ link_pagamento_mp: linkSimulado, pagamento_provider: 'mercado_pago' })
      .eq('id', pedidoId)

    return responder(200, {
      sucesso: true,
      link: linkSimulado,
      aviso: 'Token MP não configurado, link padrão gerado.',
    })
  }

  // Criar preferência real na API do Mercado Pago
  try {
    const valorTotal = Number(pedido.total || body.total || 0)
    const emailPagador = pedido.email_cliente || body.email || 'contato@bazarencantofeminino.com.br'
    const nomeCliente = pedido.cliente || body.cliente || 'Cliente Bazar'

    const preferencePayload = {
      items: [
        {
          id: String(pedido.numero || pedido.id),
          title: `Pedido ${pedido.numero} - Bazar Encanto Feminino`,
          description: `Venda Direta WhatsApp - Pedido ${pedido.numero}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: valorTotal,
        },
      ],
      payer: {
        name: nomeCliente,
        email: emailPagador,
      },
      external_reference: String(pedido.numero),
      back_urls: {
        success: 'https://bazar-encanto-feminino.vercel.app/acompanhar-pedido',
        failure: 'https://bazar-encanto-feminino.vercel.app/acompanhar-pedido',
        pending: 'https://bazar-encanto-feminino.vercel.app/acompanhar-pedido',
      },
      auto_return: 'approved',
      statement_descriptor: 'BAZAR ENCANTO',
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }

    const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpAccessToken}`,
      },
      body: JSON.stringify(preferencePayload),
    })

    if (!mpResp.ok) {
      const errData = await mpResp.json().catch(() => ({}))
      console.error('Erro ao criar preferência Mercado Pago:', errData)
      return responder(502, {
        sucesso: false,
        mensagem: 'Erro ao gerar link no Mercado Pago.',
        detalhes: errData,
      })
    }

    const prefData = await mpResp.json()
    const initPoint = prefData.init_point || prefData.sandbox_init_point

    if (!initPoint) {
      return responder(502, { sucesso: false, mensagem: 'Mercado Pago não retornou link de pagamento.' })
    }

    await adminClient
      .from('pedidos')
      .update({ link_pagamento_mp: initPoint, pagamento_provider: 'mercado_pago' })
      .eq('id', pedidoId)

    return responder(200, {
      sucesso: true,
      link: initPoint,
      preference_id: prefData.id,
    })
  } catch (erro) {
    console.error('Exceção ao chamar Mercado Pago:', erro)
    return responder(500, {
      sucesso: false,
      mensagem: 'Falha interna ao gerar link de pagamento.',
    })
  }
})
