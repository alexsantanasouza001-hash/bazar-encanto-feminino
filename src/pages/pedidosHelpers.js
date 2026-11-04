/**
 * Helper utilities for Admin > Pedidos
 * Sorting, Notifications, Summary and Display logic.
 */

export function ordenarPedidosMaisRecentes(lista) {
  if (!Array.isArray(lista)) return []
  return [...lista].sort((a, b) => {
    const dataA = new Date(
      a?.data || a?.created_at || a?.createdAt || a?.criadoEm || 0
    ).getTime() || 0

    const dataB = new Date(
      b?.data || b?.created_at || b?.createdAt || b?.criadoEm || 0
    ).getTime() || 0

    if (dataB !== dataA) {
      return dataB - dataA // Mais recente primeiro
    }

    const idA = Number(a?.id) || 0
    const idB = Number(b?.id) || 0
    return idB - idA
  })
}

export function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

export function formatarDataHora(dataIso) {
  if (!dataIso) return { data: '--', hora: '--' }
  const d = new Date(dataIso)
  if (Number.isNaN(d.getTime())) return { data: '--', hora: '--' }
  return {
    data: d.toLocaleDateString('pt-BR'),
    hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
}

export function obterProdutos(pedido) {
  if (!pedido || typeof pedido !== 'object') return []
  if (Array.isArray(pedido.itens) && pedido.itens.length > 0) return pedido.itens
  if (Array.isArray(pedido.produtos) && pedido.produtos.length > 0) return pedido.produtos
  if (Array.isArray(pedido.carrinho) && pedido.carrinho.length > 0) return pedido.carrinho
  return []
}

export function obterTotalPedido(pedido, produtos = null) {
  if (!pedido || typeof pedido !== 'object') return 0

  if (pedido.total !== undefined && pedido.total !== null && !Number.isNaN(Number(pedido.total))) {
    return Number(pedido.total)
  }
  if (pedido.valorTotal !== undefined && pedido.valorTotal !== null && !Number.isNaN(Number(pedido.valorTotal))) {
    return Number(pedido.valorTotal)
  }

  const itens = produtos || obterProdutos(pedido)
  return itens.reduce((total, produto) => {
    const quantidade = Number(produto.quantidade || 1)
    const preco = Number(produto.preco ?? produto.venda ?? produto.valor ?? 0)
    return total + preco * quantidade
  }, 0)
}

export function obterResumoItens(produtos, limite = 3) {
  if (!Array.isArray(produtos) || produtos.length === 0) {
    return {
      totalQtd: 0,
      itensVisiveis: [],
      qtdRestante: 0
    }
  }

  const totalQtd = produtos.reduce(
    (acc, it) => acc + (Number(it.quantidade) || 1),
    0
  )

  const itensVisiveis = produtos.slice(0, limite).map((item) => {
    const nome = item.nome || item.produto_nome || 'Produto'
    const cor = item.cor ? String(item.cor).trim() : ''
    const tam = item.tamanho || item.tamanho_nome ? String(item.tamanho || item.tamanho_nome).trim() : ''
    const qtd = Number(item.quantidade || 1)
    return {
      id: item.id || `${nome}-${cor}-${tam}`,
      nome,
      cor,
      tam,
      qtd,
      preco: Number(item.preco ?? item.venda ?? item.valor ?? 0),
      subtotal: Number(item.subtotal ?? (Number(item.preco ?? item.venda ?? 0) * qtd))
    }
  })

  const qtdRestante = Math.max(0, produtos.length - limite)

  return {
    totalQtd,
    itensVisiveis,
    qtdRestante
  }
}

/**
 * Filtra novos pedidos que ainda não foram notificados.
 */
export function identificarNovosPedidos(pedidosRecebidos, pedidosAnterioresIdsSet, pedidosNotificadosSet) {
  if (!Array.isArray(pedidosRecebidos)) return []

  const novos = []
  for (const pedido of pedidosRecebidos) {
    const pId = String(pedido.id || pedido.numero)
    if (!pId) continue

    // Se é um pedido que não existia na lista anterior E ainda não foi notificado
    if (!pedidosAnterioresIdsSet.has(pId) && !pedidosNotificadosSet.has(pId)) {
      novos.push(pedido)
    }
  }

  return novos
}
