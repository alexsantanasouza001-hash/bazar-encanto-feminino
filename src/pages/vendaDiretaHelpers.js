import { formatarPreco } from './pedidosHelpers.js'

export { formatarPreco }

export function normalizarTelefone(valor) {
  if (!valor) return ''
  const apenasNumeros = String(valor).replace(/\D/g, '')
  if (apenasNumeros.length === 11) {
    return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 7)}-${apenasNumeros.slice(7)}`
  }
  if (apenasNumeros.length === 10) {
    return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 6)}-${apenasNumeros.slice(6)}`
  }
  return valor
}

export function normalizarCep(valor) {
  if (!valor) return ''
  return String(valor).replace(/\D/g, '').slice(0, 8)
}

export function formatarCep(valor) {
  const limpo = normalizarCep(valor)
  if (limpo.length === 8) {
    return `${limpo.slice(0, 5)}-${limpo.slice(5)}`
  }
  return limpo
}

export function calcularPrecoComDesconto(precoBase, percentualDesconto) {
  const preco = Number(precoBase) || 0
  const perc = Math.max(0, Math.min(100, Number(percentualDesconto) || 0))
  const valorDescontoUnitario = Math.round((preco * (perc / 100.0)) * 100) / 100
  const precoLiquido = Math.max(0, Math.round((preco - valorDescontoUnitario) * 100) / 100)
  return {
    precoOriginal: preco,
    percentualDesconto: perc,
    descontoUnitario: valorDescontoUnitario,
    precoLiquido
  }
}

export function calcularTotaisVendaDireta(itens = [], valorFrete = 0) {
  let subtotalBruto = 0
  let totalDescontos = 0
  let totalItensQtd = 0
  const frete = Math.max(0, Number(valorFrete) || 0)

  itens.forEach((item) => {
    const qtd = Math.max(1, Number(item.quantidade) || 1)
    const preco = Number(item.precoPraticado ?? item.preco_praticado ?? item.preco ?? 0)
    const perc = Math.max(0, Math.min(100, Number(item.descontoPercentual ?? item.desconto_percentual ?? 0)))
    const { descontoUnitario } = calcularPrecoComDesconto(preco, perc)

    subtotalBruto += preco * qtd
    totalDescontos += descontoUnitario * qtd
    totalItensQtd += qtd
  })

  subtotalBruto = Math.round(subtotalBruto * 100) / 100
  totalDescontos = Math.round(totalDescontos * 100) / 100
  const totalProdutos = Math.max(0, Math.round((subtotalBruto - totalDescontos) * 100) / 100)
  const totalFinal = Math.max(0, Math.round((totalProdutos + frete) * 100) / 100)

  return {
    subtotalBruto,
    totalDescontos,
    totalProdutos,
    valorFrete: frete,
    totalFinal,
    totalItensQtd
  }
}

export function montarResumoWhatsApp({
  cliente,
  itens = [],
  valorFrete = 0,
  modalidadeEntrega = 'correios',
  formaPagamento = 'Pix',
  chavePix = 'bazarencanto610@gmail.com'
}) {
  const { totalProdutos, valorFrete: frete, totalFinal } = calcularTotaisVendaDireta(itens, valorFrete)

  const linhasItens = itens.map((it) => {
    const nome = it.nome || 'Produto'
    const cor = it.cor && it.cor !== 'Única' ? ` (${it.cor})` : ''
    const tam = it.tamanho ? ` Tam: ${it.tamanho}` : ''
    const qtd = it.quantidade || 1
    const preco = Number(it.precoPraticado || it.preco || 0)
    const perc = Number(it.descontoPercentual || 0)
    const { precoLiquido } = calcularPrecoComDesconto(preco, perc)
    const totalItem = Math.round(precoLiquido * qtd * 100) / 100

    const descTexto = perc > 0 ? ` (c/ ${perc}% desc)` : ''
    return `• ${nome}${cor}${tam}\n  ${qtd} × ${formatarPreco(precoLiquido)}${descTexto} = *${formatarPreco(totalItem)}*`
  })

  let textoEntrega = 'Frete a combinar'
  if (modalidadeEntrega === 'motoboy_cliente') {
    textoEntrega = 'Retirada por Motoboy da cliente (R$ 0,00)'
  } else if (modalidadeEntrega === 'retirada') {
    textoEntrega = 'Retirada combinada na loja (R$ 0,00)'
  } else if (frete > 0) {
    textoEntrega = formatarPreco(frete)
  } else if (frete === 0) {
    textoEntrega = 'Grátis'
  }

  const saudacao = cliente ? `Olá, *${cliente}*! 💚\n\nSegue o resumo da sua compra no *Bazar Encanto Feminino*:\n` : `Resumo do pedido no *Bazar Encanto Feminino*:\n`

  let blocoPix = ''
  if (!formaPagamento || formaPagamento.toLowerCase().includes('pix')) {
    blocoPix = `\n\nChave Pix:\n\`${chavePix || 'bazarencanto610@gmail.com'}\`\n\nPor favor, envie o comprovante após a transferência.`
  }

  return `${saudacao}
${linhasItens.join('\n\n')}

───────────────────
🛍️ *Produtos:* ${formatarPreco(totalProdutos)}
🚚 *Entrega:* ${textoEntrega}
✨ *TOTAL:* *${formatarPreco(totalFinal)}*${blocoPix}`
}

export function montarMensagemFinalWhatsApp({
  pedido,
  linkPagamento = '',
  lojaUrl = 'https://bazar-encanto-feminino.vercel.app'
}) {
  if (!pedido) return ''

  const cliente = pedido.cliente || 'Cliente'
  const numero = pedido.numero || 'PED-000000'
  const codigo = pedido.codigo_acompanhamento || pedido.codigo || ''
  const total = formatarPreco(pedido.total || 0)
  const formaPag = pedido.forma_pagamento || ''

  let blocoLinkCartao = ''
  if (formaPag.toLowerCase().includes('cart') && (linkPagamento || pedido.link_pagamento_mp)) {
    blocoLinkCartao = `\n\n💳 *Link de Pagamento (Cartão):*\n${linkPagamento || pedido.link_pagamento_mp}`
  }

  const linkAcompanhamento = `${lojaUrl}/acompanhar-pedido`

  return `Olá, *${cliente}*! 💚

Seu pedido no *Bazar Encanto Feminino* foi registrado com sucesso!

📦 *Pedido:* *${numero}*
📋 *Status:* Pagamento confirmado
✨ *Total:* *${total}*${blocoLinkCartao}

───────────────────
🔍 *Código de Acompanhamento Seguro:*
\`${codigo}\`

Você pode acompanhar o andamento da sua compra a qualquer momento pelo link:
${linkAcompanhamento}
_(Basta inserir o seu código: *${codigo}*)_

Muito obrigada pela preferência! Qualquer dúvida, estamos à disposição por aqui. 🌸`
}

export function filtrarOpcoesFreteVendaDireta(opcoes = []) {
  if (!Array.isArray(opcoes)) return []

  let pacOption = null
  let sedexOption = null

  for (const opt of opcoes) {
    if (!opt) continue

    const servico = String(opt.servico || opt.name || '').trim()
    const transportadora = String(opt.transportadora || opt.company?.name || '').trim()
    const servicoUpper = servico.toUpperCase()
    const transpUpper = transportadora.toUpperCase()

    const precoRaw = opt.preco ?? opt.valor ?? opt.custom_price ?? opt.price
    const preco = Number(precoRaw)

    // Preço deve ser estritamente válido e positivo (> 0)
    if (!Number.isFinite(preco) || preco <= 0) {
      continue
    }

    const prazoDias = Number(opt.prazo_dias ?? opt.delivery_time ?? opt.custom_delivery_time ?? 5)
    const prazoTexto = opt.prazo_texto || `${prazoDias} dias úteis`

    // Identificação precisa de PAC dos Correios (não confundir com Jadlog .Package ou outros)
    const ehPac = (servicoUpper === 'PAC' || servicoUpper.startsWith('PAC ') || /\bPAC\b/.test(servicoUpper)) &&
                  !servicoUpper.includes('.PACKAGE') &&
                  !transpUpper.includes('JADLOG') &&
                  !transpUpper.includes('AZUL') &&
                  !transpUpper.includes('LOGGI')

    // Identificação precisa de SEDEX dos Correios
    const ehSedex = (servicoUpper === 'SEDEX' || servicoUpper.startsWith('SEDEX ') || /\bSEDEX\b/.test(servicoUpper)) &&
                    !transpUpper.includes('JADLOG') &&
                    !transpUpper.includes('AZUL') &&
                    !transpUpper.includes('LOGGI')

    if (ehPac && !pacOption) {
      pacOption = {
        id: String(opt.id || 'pac'),
        servico: 'PAC',
        transportadora: 'Correios',
        preco,
        valor: preco,
        prazo_dias: prazoDias,
        prazo_texto: prazoTexto
      }
    } else if (ehSedex && !sedexOption) {
      sedexOption = {
        id: String(opt.id || 'sedex'),
        servico: 'SEDEX',
        transportadora: 'Correios',
        preco,
        valor: preco,
        prazo_dias: prazoDias,
        prazo_texto: prazoTexto
      }
    }
  }

  // Ordem obrigatória: 1. PAC, 2. SEDEX
  const resultado = []
  if (pacOption) resultado.push(pacOption)
  if (sedexOption) resultado.push(sedexOption)

  return resultado
}
