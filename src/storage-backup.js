import { produtosIniciais } from './data/products'

const CHAVE_PRODUTOS = 'meu_bazar_produtos'
const CHAVE_MOVIMENTACOES = 'meu_bazar_movimentacoes'
const CHAVE_PEDIDOS = 'meu_bazar_pedidos'

// =====================================================
// PRODUTOS
// =====================================================

export function carregarProdutos() {
  const dados = localStorage.getItem(CHAVE_PRODUTOS)

  if (!dados) {
    localStorage.setItem(
      CHAVE_PRODUTOS,
      JSON.stringify(produtosIniciais)
    )

    return produtosIniciais
  }

  try {
    const produtos = JSON.parse(dados)

    if (!Array.isArray(produtos)) {
      return produtosIniciais
    }

    return produtos
  } catch (erro) {
    console.error('Erro ao carregar produtos:', erro)
    return produtosIniciais
  }
}

export function salvarProdutos(produtos) {
  localStorage.setItem(
    CHAVE_PRODUTOS,
    JSON.stringify(produtos)
  )
}

export function adicionarProduto(produto) {
  const produtos = carregarProdutos()

  const novoProduto = {
    ...produto,
    id: Date.now()
  }

  const novosProdutos = [
    ...produtos,
    novoProduto
  ]

  salvarProdutos(novosProdutos)

  return novoProduto
}

export function atualizarProduto(produtoAtualizado) {
  const produtos = carregarProdutos()

  const novosProdutos = produtos.map((produto) => {
    if (
      String(produto.id) ===
      String(produtoAtualizado.id)
    ) {
      return produtoAtualizado
    }

    return produto
  })

  salvarProdutos(novosProdutos)

  return novosProdutos
}

export function removerProduto(id) {
  const produtos = carregarProdutos()

  const novosProdutos = produtos.filter(
    (produto) =>
      String(produto.id) !== String(id)
  )

  salvarProdutos(novosProdutos)

  return novosProdutos
}

// =====================================================
// MOVIMENTAÇÕES
// =====================================================

export function carregarMovimentacoes() {
  const dados = localStorage.getItem(
    CHAVE_MOVIMENTACOES
  )

  if (!dados) {
    return []
  }

  try {
    const movimentacoes = JSON.parse(dados)

    if (!Array.isArray(movimentacoes)) {
      return []
    }

    return movimentacoes
  } catch (erro) {
    console.error(
      'Erro ao carregar movimentações:',
      erro
    )

    return []
  }
}

export function salvarMovimentacoes(
  movimentacoes
) {
  localStorage.setItem(
    CHAVE_MOVIMENTACOES,
    JSON.stringify(movimentacoes)
  )
}

// =====================================================
// ENTRADA DE ESTOQUE
// =====================================================

export function registrarEntradaEstoque({
  produtoId,
  quantidade,
  observacao = ''
}) {
  const produtos = carregarProdutos()

  const quantidadeEntrada =
    Number(quantidade)

  if (
    !produtoId ||
    !Number.isFinite(quantidadeEntrada) ||
    quantidadeEntrada <= 0
  ) {
    return {
      sucesso: false,
      mensagem:
        'Informe um produto e uma quantidade válida.'
    }
  }

  const produto = produtos.find(
    (item) =>
      String(item.id) ===
      String(produtoId)
  )

  if (!produto) {
    return {
      sucesso: false,
      mensagem:
        'Produto não encontrado.'
    }
  }

  const estoqueAnterior =
    Number(produto.quantidade || 0)

  const novoEstoque =
    estoqueAnterior +
    quantidadeEntrada

  const novosProdutos =
    produtos.map((item) => {
      if (
        String(item.id) !==
        String(produtoId)
      ) {
        return item
      }

      return {
        ...item,
        quantidade: novoEstoque
      }
    })

  salvarProdutos(novosProdutos)

  const movimentacoes =
    carregarMovimentacoes()

  const movimentacao = {
    id: Date.now(),
    produtoId: produto.id,
    produtoNome: produto.nome,
    tipo: 'entrada',
    quantidade: quantidadeEntrada,
    estoqueAnterior,
    estoqueAtual: novoEstoque,
    observacao,
    data: new Date().toISOString()
  }

  salvarMovimentacoes([
    ...movimentacoes,
    movimentacao
  ])

  return {
    sucesso: true,
    produtos: novosProdutos,
    movimentacao
  }
}

// =====================================================
// SAÍDA DE ESTOQUE
// =====================================================

export function registrarSaidaEstoque({
  produtoId,
  quantidade,
  observacao = ''
}) {
  const produtos = carregarProdutos()

  const quantidadeSaida =
    Number(quantidade)

  if (
    !produtoId ||
    !Number.isFinite(quantidadeSaida) ||
    quantidadeSaida <= 0
  ) {
    return {
      sucesso: false,
      mensagem:
        'Informe um produto e uma quantidade válida.'
    }
  }

  const produto = produtos.find(
    (item) =>
      String(item.id) ===
      String(produtoId)
  )

  if (!produto) {
    return {
      sucesso: false,
      mensagem:
        'Produto não encontrado.'
    }
  }

  const estoqueAnterior =
    Number(produto.quantidade || 0)

  if (
    quantidadeSaida >
    estoqueAnterior
  ) {
    return {
      sucesso: false,
      mensagem:
        'Estoque insuficiente. Disponível: ' +
        estoqueAnterior +
        ' peça(s).'
    }
  }

  const novoEstoque =
    estoqueAnterior -
    quantidadeSaida

  const novosProdutos =
    produtos.map((item) => {
      if (
        String(item.id) !==
        String(produtoId)
      ) {
        return item
      }

      return {
        ...item,
        quantidade: novoEstoque
      }
    })

  salvarProdutos(novosProdutos)

  const movimentacoes =
    carregarMovimentacoes()

  const movimentacao = {
    id: Date.now(),
    produtoId: produto.id,
    produtoNome: produto.nome,
    tipo: 'saida',
    quantidade: quantidadeSaida,
    estoqueAnterior,
    estoqueAtual: novoEstoque,
    observacao,
    data: new Date().toISOString()
  }

  salvarMovimentacoes([
    ...movimentacoes,
    movimentacao
  ])

  return {
    sucesso: true,
    produtos: novosProdutos,
    movimentacao
  }
}

// =====================================================
// PEDIDOS
// =====================================================

export function carregarPedidos() {
  const dados = localStorage.getItem(
    CHAVE_PEDIDOS
  )

  if (!dados) {
    return []
  }

  try {
    const pedidos = JSON.parse(dados)

    if (!Array.isArray(pedidos)) {
      return []
    }

    return pedidos
  } catch (erro) {
    console.error(
      'Erro ao carregar pedidos:',
      erro
    )

    return []
  }
}

export function salvarPedidos(pedidos) {
  localStorage.setItem(
    CHAVE_PEDIDOS,
    JSON.stringify(pedidos)
  )
}

// =====================================================
// REGISTRAR PEDIDO DA LOJA
// =====================================================

export function registrarPedido({
  nomeCliente,
  itens
}) {
  const produtos = carregarProdutos()

  if (!nomeCliente || !nomeCliente.trim()) {
    return {
      sucesso: false,
      mensagem:
        'Informe o nome da cliente.'
    }
  }

  if (
    !Array.isArray(itens) ||
    itens.length === 0
  ) {
    return {
      sucesso: false,
      mensagem:
        'O carrinho está vazio.'
    }
  }

  // ---------------------------------------------------
  // VALIDAR TODO O ESTOQUE ANTES DE ALTERAR
  // ---------------------------------------------------

  for (const item of itens) {
    const produto = produtos.find(
      (produtoAtual) =>
        String(produtoAtual.id) ===
        String(item.id)
    )

    if (!produto) {
      return {
        sucesso: false,
        mensagem:
          `O produto "${item.nome}" não foi encontrado.`
      }
    }

    const estoqueAtual =
      Number(produto.quantidade || 0)

    const quantidadePedida =
      Number(item.quantidade || 0)

    if (estoqueAtual <= 0) {
      return {
        sucesso: false,
        mensagem:
          `O produto "${produto.nome}" está sem estoque.`
      }
    }

    if (
      quantidadePedida >
      estoqueAtual
    ) {
      return {
        sucesso: false,
        mensagem:
          `Estoque insuficiente para "${produto.nome}". Disponível: ${estoqueAtual} peça(s).`
      }
    }
  }

  // ---------------------------------------------------
  // CALCULAR TOTAL
  // ---------------------------------------------------

  const itensPedido = itens.map((item) => {
    const produto = produtos.find(
      (produtoAtual) =>
        String(produtoAtual.id) ===
        String(item.id)
    )

    const quantidade =
      Number(item.quantidade || 0)

    const preco =
      Number(produto.venda || 0)

    return {
      produtoId: produto.id,
      nome: produto.nome,
      marca: produto.marca || '',
      categoria: produto.categoria || '',
      tamanho: produto.tamanho || '',
      cor: produto.cor || '',
      sku: produto.sku || '',
      quantidade,
      preco,
      subtotal: preco * quantidade
    }
  })

  const total = itensPedido.reduce(
    (soma, item) =>
      soma + item.subtotal,
    0
  )

  // ---------------------------------------------------
  // ATUALIZAR ESTOQUE
  // ---------------------------------------------------

  const novosProdutos =
    produtos.map((produto) => {
      const itemPedido =
        itensPedido.find(
          (item) =>
            String(item.produtoId) ===
            String(produto.id)
        )

      if (!itemPedido) {
        return produto
      }

      const estoqueAnterior =
        Number(produto.quantidade || 0)

      return {
        ...produto,
        quantidade:
          estoqueAnterior -
          itemPedido.quantidade
      }
    })

  salvarProdutos(novosProdutos)

  // ---------------------------------------------------
  // REGISTRAR MOVIMENTAÇÕES
  // ---------------------------------------------------

  const movimentacoes =
    carregarMovimentacoes()

  const novasMovimentacoes =
    itensPedido.map((item, index) => {
      const produto =
        produtos.find(
          (produtoAtual) =>
            String(produtoAtual.id) ===
            String(item.produtoId)
        )

      const estoqueAnterior =
        Number(
          produto.quantidade || 0
        )

      const estoqueAtual =
        estoqueAnterior -
        item.quantidade

      return {
        id:
          Date.now() +
          index,
        produtoId:
          produto.id,
        produtoNome:
          produto.nome,
        tipo: 'saida',
        quantidade:
          item.quantidade,
        estoqueAnterior,
        estoqueAtual,
        observacao:
          'Venda pelo aplicativo da loja',
        data:
          new Date().toISOString()
      }
    })

  salvarMovimentacoes([
    ...movimentacoes,
    ...novasMovimentacoes
  ])

  // ---------------------------------------------------
  // CRIAR PEDIDO
  // ---------------------------------------------------

  const pedido = {
    id: Date.now(),
    numero:
      `PED-${String(Date.now()).slice(-6)}`,
    cliente:
      nomeCliente.trim(),
    itens: itensPedido,
    total,
    status: 'Novo',
    origem: 'Loja / WhatsApp',
    data:
      new Date().toISOString()
  }

  const pedidos =
    carregarPedidos()

  salvarPedidos([
    pedido,
    ...pedidos
  ])

  return {
    sucesso: true,
    pedido,
    produtos: novosProdutos
  }
}

// =====================================================
// ATUALIZAR STATUS DO PEDIDO
// =====================================================

export function atualizarStatusPedido(
  pedidoId,
  novoStatus
) {
  const pedidos =
    carregarPedidos()

  const novosPedidos =
    pedidos.map((pedido) => {
      if (
        String(pedido.id) ===
        String(pedidoId)
      ) {
        return {
          ...pedido,
          status: novoStatus
        }
      }

      return pedido
    })

  salvarPedidos(novosPedidos)

  return novosPedidos
}

// =====================================================
// REMOVER PEDIDO
// =====================================================

export function removerPedido(pedidoId) {
  const pedidos =
    carregarPedidos()

  const novosPedidos =
    pedidos.filter(
      (pedido) =>
        String(pedido.id) !==
        String(pedidoId)
    )

  salvarPedidos(novosPedidos)

  return novosPedidos
}