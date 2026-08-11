import { supabase } from './lib/supabase'
import { produtosIniciais } from './data/products'

const CHAVE_PRODUTOS = 'meu_bazar_produtos'
const CHAVE_MOVIMENTACOES = 'meu_bazar_movimentacoes'
const CHAVE_PEDIDOS = 'meu_bazar_pedidos'

// =====================================================
// AUXILIARES
// =====================================================

function normalizarProduto(produto) {
if (!produto) {
return null
}

return {
...produto,
id: Number(produto.id),
quantidade: Number(produto.quantidade || 0),
custo: Number(produto.custo || 0),
venda: Number(produto.venda || 0),
nome: produto.nome || '',
marca: produto.marca || '',
categoria: produto.categoria || '',
tamanho: produto.tamanho || '',
cor: produto.cor || '',
sku: produto.sku || '',
foto:
produto.foto ||
produto.imagem ||
produto.image ||
null
}
}

function produtoParaBanco(produto) {
return {
id: Number(produto.id) || Date.now(),
nome: produto.nome || '',
marca: produto.marca || '',
categoria: produto.categoria || '',
tamanho: produto.tamanho || '',
cor: produto.cor || '',
sku: produto.sku || '',
quantidade: Number(produto.quantidade || 0),
custo: Number(produto.custo || 0),
venda: Number(produto.venda || 0),
foto:
produto.foto ||
produto.imagem ||
produto.image ||
null
}
}

function normalizarMovimentacao(movimentacao) {
if (!movimentacao) {
return null
}

return {
id: Number(movimentacao.id),
produtoId: Number(
movimentacao.produto_id ??
movimentacao.produtoId ??
0
),
produtoNome:
movimentacao.produto_nome ??
movimentacao.produtoNome ??
'',
tipo: movimentacao.tipo || '',
quantidade: Number(
movimentacao.quantidade || 0
),
estoqueAnterior: Number(
movimentacao.estoque_anterior ??
movimentacao.estoqueAnterior ??
0
),
estoqueAtual: Number(
movimentacao.estoque_atual ??
movimentacao.estoqueAtual ??
0
),
observacao:
movimentacao.observacao || '',
data:
movimentacao.data ||
new Date().toISOString()
}
}

// =====================================================
// PRODUTOS
// =====================================================

export async function carregarProdutos() {
try {
const { data, error } = await supabase
.from('produtos')
.select('*')
.order('id', {
ascending: false
})

if (error) {
  console.error(
    'Erro ao carregar produtos do Supabase:',
    error
  )

  return carregarProdutosLocal()
}

if (!Array.isArray(data)) {
  return carregarProdutosLocal()
}

if (data.length === 0) {
  const locais = carregarProdutosLocal()

  if (locais.length > 0) {
    await migrarProdutos(locais)

    const resultado = await supabase
      .from('produtos')
      .select('*')
      .order('id', {
        ascending: false
      })

    if (
      !resultado.error &&
      Array.isArray(resultado.data)
    ) {
      const produtos =
        resultado.data.map(normalizarProduto)

      localStorage.setItem(
        CHAVE_PRODUTOS,
        JSON.stringify(produtos)
      )

      return produtos
    }
  }

  return []
}

const produtos =
  data
    .map(normalizarProduto)
    .filter(Boolean)

localStorage.setItem(
  CHAVE_PRODUTOS,
  JSON.stringify(produtos)
)

return produtos

} catch (erro) {
console.error(
'Erro inesperado ao carregar produtos:',
erro
)

return carregarProdutosLocal()

}
}

function carregarProdutosLocal() {
try {
const dados =
localStorage.getItem(
CHAVE_PRODUTOS
)

if (!dados) {
  return Array.isArray(produtosIniciais)
    ? produtosIniciais.map(normalizarProduto)
    : []
}

const produtos = JSON.parse(dados)

if (!Array.isArray(produtos)) {
  return Array.isArray(produtosIniciais)
    ? produtosIniciais.map(normalizarProduto)
    : []
}

return produtos
  .map(normalizarProduto)
  .filter(Boolean)

} catch (erro) {
console.error(
'Erro ao carregar produtos locais:',
erro
)

return Array.isArray(produtosIniciais)
  ? produtosIniciais.map(normalizarProduto)
  : []

}
}

async function migrarProdutos(produtos) {
if (
!Array.isArray(produtos) ||
produtos.length === 0
) {
return
}

try {
const produtosBanco =
produtos
.map(produtoParaBanco)
.filter(Boolean)

const { error } = await supabase
  .from('produtos')
  .upsert(
    produtosBanco,
    {
      onConflict: 'id'
    }
  )

if (error) {
  console.error(
    'Erro ao migrar produtos:',
    error
  )
}

} catch (erro) {
console.error(
'Erro na migração:',
erro
)
}
}

export async function salvarProdutos(produtos) {
if (!Array.isArray(produtos)) {
return []
}

try {
const produtosBanco =
produtos.map(produtoParaBanco)

const { error } = await supabase
  .from('produtos')
  .upsert(
    produtosBanco,
    {
      onConflict: 'id'
    }
  )

if (error) {
  console.error(
    'Erro ao salvar produtos:',
    error
  )

  return produtos
}

localStorage.setItem(
  CHAVE_PRODUTOS,
  JSON.stringify(produtos)
)

return produtos

} catch (erro) {
console.error(
'Erro ao salvar produtos:',
erro
)

return produtos

}
}

export async function adicionarProduto(produto) {
const novoProduto = {
...produto,
id:
produto.id ||
Date.now()
}

try {
const produtoBanco =
produtoParaBanco(novoProduto)

const { data, error } =
  await supabase
    .from('produtos')
    .insert(produtoBanco)
    .select()
    .single()

if (error) {
  console.error(
    'Erro ao adicionar produto:',
    error
  )

  throw error
}

return normalizarProduto(data)

} catch (erro) {
console.error(
'Erro ao adicionar produto:',
erro
)

throw erro

}
}

export async function atualizarProduto(
produtoAtualizado
) {
try {
const produtoBanco = {
nome:
produtoAtualizado.nome || '',
marca:
produtoAtualizado.marca || '',
categoria:
produtoAtualizado.categoria || '',
tamanho:
produtoAtualizado.tamanho || '',
cor:
produtoAtualizado.cor || '',
sku:
produtoAtualizado.sku || '',
quantidade:
Number(
produtoAtualizado.quantidade || 0
),
custo:
Number(
produtoAtualizado.custo || 0
),
venda:
Number(
produtoAtualizado.venda || 0
),
foto:
produtoAtualizado.foto ||
produtoAtualizado.imagem ||
produtoAtualizado.image ||
null
}

const { data, error } =
  await supabase
    .from('produtos')
    .update(produtoBanco)
    .eq(
      'id',
      Number(
        produtoAtualizado.id
      )
    )
    .select()
    .single()

if (error) {
  console.error(
    'Erro ao atualizar produto:',
    error
  )

  throw error
}

return normalizarProduto(data)

} catch (erro) {
console.error(
'Erro ao atualizar produto:',
erro
)

throw erro

}
}

export async function removerProduto(id) {
try {
const { error } =
await supabase
.from('produtos')
.delete()
.eq(
'id',
Number(id)
)

if (error) {
  console.error(
    'Erro ao remover produto:',
    error
  )

  throw error
}

return carregarProdutos()

} catch (erro) {
console.error(
'Erro ao remover produto:',
erro
)

throw erro

}
}

// =====================================================
// MOVIMENTAÇÕES
// =====================================================

export async function carregarMovimentacoes() {
try {
const { data, error } =
await supabase
.from('movimentacoes')
.select('*')
.order('data', {
ascending: false
})

if (error) {
  console.error(
    'Erro ao carregar movimentações:',
    error
  )

  return []
}

if (!Array.isArray(data)) {
  return []
}

const movimentacoes =
  data
    .map(normalizarMovimentacao)
    .filter(Boolean)

localStorage.setItem(
  CHAVE_MOVIMENTACOES,
  JSON.stringify(
    movimentacoes
  )
)

return movimentacoes

} catch (erro) {
console.error(
'Erro ao carregar movimentações:',
erro
)

return []

}
}

export async function salvarMovimentacoes(
movimentacoes
) {
if (
!Array.isArray(movimentacoes)
) {
return []
}

try {
for (
const movimentacao of movimentacoes
) {
const registro = {
id:
Number(
movimentacao.id
) ||
Date.now(),

    produto_id:
      Number(
        movimentacao.produtoId ??
        movimentacao.produto_id
      ),

    produto_nome:
      movimentacao.produtoNome ??
      movimentacao.produto_nome ??
      '',

    tipo:
      movimentacao.tipo ||
      '',

    quantidade:
      Number(
        movimentacao.quantidade ||
        0
      ),

    estoque_anterior:
      Number(
        movimentacao.estoqueAnterior ??
        movimentacao.estoque_anterior ??
        0
      ),

    estoque_atual:
      Number(
        movimentacao.estoqueAtual ??
        movimentacao.estoque_atual ??
        0
      ),

    observacao:
      movimentacao.observacao ||
      '',

    data:
      movimentacao.data ||
      new Date().toISOString()
  }

  const { error } =
    await supabase
      .from('movimentacoes')
      .upsert(
        registro,
        {
          onConflict: 'id'
        }
      )

  if (error) {
    console.error(
      'Erro ao salvar movimentação:',
      error
    )
  }
}

localStorage.setItem(
  CHAVE_MOVIMENTACOES,
  JSON.stringify(
    movimentacoes
  )
)

return movimentacoes

} catch (erro) {
console.error(
'Erro ao salvar movimentações:',
erro
)

return movimentacoes

}
}

// =====================================================
// ENTRADA DE ESTOQUE
// =====================================================

export async function registrarEntradaEstoque({
produtoId,
quantidade,
observacao = ''
}) {
const quantidadeEntrada =
Number(quantidade)

if (
!produtoId ||
!Number.isFinite(
quantidadeEntrada
) ||
quantidadeEntrada <= 0
) {
return {
sucesso: false,
mensagem:
'Informe um produto e uma quantidade válida.'
}
}

try {
const {
data: produto,
error
} = await supabase
.from('produtos')
.select('*')
.eq(
'id',
Number(produtoId)
)
.single()

if (
  error ||
  !produto
) {
  return {
    sucesso: false,
    mensagem:
      'Produto não encontrado.'
  }
}

const estoqueAnterior =
  Number(
    produto.quantidade || 0
  )

const novoEstoque =
  estoqueAnterior +
  quantidadeEntrada

const {
  data: atualizado,
  error: erroUpdate
} = await supabase
  .from('produtos')
  .update({
    quantidade:
      novoEstoque
  })
  .eq(
    'id',
    Number(produtoId)
  )
  .select()
  .single()

if (erroUpdate) {
  console.error(
    'Erro ao atualizar estoque:',
    erroUpdate
  )

  return {
    sucesso: false,
    mensagem:
      'Não foi possível atualizar o estoque.'
  }
}

const movimentacao = {
  id:
    Date.now(),

  produtoId:
    produto.id,

  produtoNome:
    produto.nome,

  tipo:
    'entrada',

  quantidade:
    quantidadeEntrada,

  estoqueAnterior,

  estoqueAtual:
    novoEstoque,

  observacao,

  data:
    new Date().toISOString()
}

await salvarMovimentacoes([
  movimentacao
])

return {
  sucesso: true,
  produtos:
    await carregarProdutos(),
  movimentacao,
  produto:
    normalizarProduto(
      atualizado
    )
}

} catch (erro) {
console.error(
'Erro na entrada de estoque:',
erro
)

return {
  sucesso: false,
  mensagem:
    'Erro ao registrar entrada de estoque.'
}

}
}

// =====================================================
// SAÍDA DE ESTOQUE
// =====================================================

export async function registrarSaidaEstoque({
produtoId,
quantidade,
observacao = ''
}) {
const quantidadeSaida =
Number(quantidade)

if (
!produtoId ||
!Number.isFinite(
quantidadeSaida
) ||
quantidadeSaida <= 0
) {
return {
sucesso: false,
mensagem:
'Informe um produto e uma quantidade válida.'
}
}

try {
const {
data: produto,
error
} = await supabase
.from('produtos')
.select('*')
.eq(
'id',
Number(produtoId)
)
.single()

if (
  error ||
  !produto
) {
  return {
    sucesso: false,
    mensagem:
      'Produto não encontrado.'
  }
}

const estoqueAnterior =
  Number(
    produto.quantidade || 0
  )

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

const {
  data: atualizado,
  error: erroUpdate
} = await supabase
  .from('produtos')
  .update({
    quantidade:
      novoEstoque
  })
  .eq(
    'id',
    Number(produtoId)
  )
  .select()
  .single()

if (erroUpdate) {
  console.error(
    'Erro ao atualizar estoque:',
    erroUpdate
  )

  return {
    sucesso: false,
    mensagem:
      'Não foi possível atualizar o estoque.'
  }
}

const movimentacao = {
  id:
    Date.now(),

  produtoId:
    produto.id,

  produtoNome:
    produto.nome,

  tipo:
    'saida',

  quantidade:
    quantidadeSaida,

  estoqueAnterior,

  estoqueAtual:
    novoEstoque,

  observacao,

  data:
    new Date().toISOString()
}

await salvarMovimentacoes([
  movimentacao
])

return {
  sucesso: true,
  produtos:
    await carregarProdutos(),
  movimentacao,
  produto:
    normalizarProduto(
      atualizado
    )
}

} catch (erro) {
console.error(
'Erro na saída de estoque:',
erro
)

return {
  sucesso: false,
  mensagem:
    'Erro ao registrar saída de estoque.'
}

}
}

// =====================================================
// PEDIDOS
// =====================================================

export async function carregarPedidos() {
try {
const {
data: pedidos,
error
} = await supabase
.from('pedidos')
.select('*')
.order('data', {
ascending: false
})

if (error) {
  console.error(
    'Erro ao carregar pedidos:',
    error
  )

  return []
}

if (
  !Array.isArray(pedidos)
) {
  return []
}

const resultado = []

for (
  const pedido of pedidos
) {
  const {
    data: itens,
    error: erroItens
  } = await supabase
    .from('pedido_itens')
    .select('*')
    .eq(
      'pedido_id',
      pedido.id
    )

  if (erroItens) {
    console.error(
      'Erro ao carregar itens do pedido:',
      erroItens
    )
  }

  resultado.push({
    id:
      pedido.id,

    numero:
      pedido.numero,

    cliente:
      pedido.cliente ||
      '',

    nomeCliente:
      pedido.cliente ||
      '',

    total:
      Number(
        pedido.total || 0
      ),

    status:
      pedido.status ||
      'Confirmado',

    origem:
      pedido.origem ||
      '',

    data:
      pedido.data,

    itens:
      Array.isArray(itens)
        ? itens.map(
            (item) => ({
              id:
                item.id,

              produtoId:
                item.produto_id,

              nome:
                item.nome ||
                '',

              marca:
                item.marca ||
                '',

              categoria:
                item.categoria ||
                '',

              tamanho:
                item.tamanho ||
                '',

              cor:
                item.cor ||
                '',

              sku:
                item.sku ||
                '',

              quantidade:
                Number(
                  item.quantidade ||
                  0
                ),

              preco:
                Number(
                  item.preco ||
                  0
                ),

              subtotal:
                Number(
                  item.subtotal ||
                  0
                )
            })
          )
        : []
  })
}

localStorage.setItem(
  CHAVE_PEDIDOS,
  JSON.stringify(
    resultado
  )
)

return resultado

} catch (erro) {
console.error(
'Erro ao carregar pedidos:',
erro
)

return []

}
}

export async function salvarPedidos(
pedidos
) {
if (
!Array.isArray(pedidos)
) {
return []
}

try {
for (
const pedido of pedidos
) {
const registro = {
id:
Number(
pedido.id
),

    numero:
      pedido.numero ||
      `PED-${String(
        pedido.id
      ).slice(-6)}`,

    cliente:
      pedido.cliente ||
      pedido.nomeCliente ||
      'Cliente',

    total:
      Number(
        pedido.total || 0
      ),

    status:
      pedido.status ||
      'Confirmado',

    origem:
      pedido.origem ||
      '',

    data:
      pedido.data ||
      new Date().toISOString()
  }

  const { error } =
    await supabase
      .from('pedidos')
      .upsert(
        registro,
        {
          onConflict: 'id'
        }
      )

  if (error) {
    console.error(
      'Erro ao salvar pedido:',
      error
    )
  }
}

localStorage.setItem(
  CHAVE_PEDIDOS,
  JSON.stringify(
    pedidos
  )
)

return pedidos

} catch (erro) {
console.error(
'Erro ao salvar pedidos:',
erro
)

return pedidos

}
}

// =====================================================
// REGISTRAR PEDIDO
// =====================================================

export async function registrarPedido({
nomeCliente,
itens
}) {
if (
!nomeCliente ||
!nomeCliente.trim()
) {
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

try {
const ids =
itens.map(
(item) =>
Number(item.id)
)

const {
  data: produtos,
  error
} = await supabase
  .from('produtos')
  .select('*')
  .in(
    'id',
    ids
  )

if (error) {
  console.error(
    'Erro ao consultar produtos:',
    error
  )

  return {
    sucesso: false,
    mensagem:
      'Não foi possível consultar o estoque.'
  }
}

if (
  !Array.isArray(produtos)
) {
  return {
    sucesso: false,
    mensagem:
      'Não foi possível consultar os produtos.'
  }
}

for (
  const item of itens
) {
  const produto =
    produtos.find(
      (produtoAtual) =>
        String(
          produtoAtual.id
        ) ===
        String(item.id)
    )

  if (!produto) {
    return {
      sucesso: false,
      mensagem:
        `O produto "${item.nome}" não foi encontrado.`
    }
  }

  const estoque =
    Number(
      produto.quantidade || 0
    )

  const quantidade =
    Number(
      item.quantidade || 0
    )

  if (
    estoque <= 0
  ) {
    return {
      sucesso: false,
      mensagem:
        `O produto "${produto.nome}" está sem estoque.`
    }
  }

  if (
    quantidade >
    estoque
  ) {
    return {
      sucesso: false,
      mensagem:
        `Estoque insuficiente para "${produto.nome}". Disponível: ${estoque} peça(s).`
    }
  }
}

const itensPedido =
  itens.map(
    (item) => {
      const produto =
        produtos.find(
          (produtoAtual) =>
            String(
              produtoAtual.id
            ) ===
            String(item.id)
        )

      const quantidade =
        Number(
          item.quantidade || 0
        )

      const preco =
        Number(
          produto.venda || 0
        )

      return {
        produtoId:
          produto.id,

        nome:
          produto.nome,

        marca:
          produto.marca ||
          '',

        categoria:
          produto.categoria ||
          '',

        tamanho:
          produto.tamanho ||
          '',

        cor:
          produto.cor ||
          '',

        sku:
          produto.sku ||
          '',

        quantidade,

        preco,

        subtotal:
          preco *
          quantidade
      }
    }
  )

const total =
  itensPedido.reduce(
    (
      soma,
      item
    ) =>
      soma +
      item.subtotal,
    0
  )

const id =
  Date.now()

const pedido = {
  id,

  numero:
    `PED-${String(
      id
    ).slice(-6)}`,

  cliente:
    nomeCliente.trim(),

  total,

  status:
    'Confirmado',

  origem:
    'Loja / WhatsApp',

  data:
    new Date().toISOString()
}

const {
  error: erroPedido
} = await supabase
  .from('pedidos')
  .insert(
    pedido
  )

if (erroPedido) {
  console.error(
    'Erro ao criar pedido:',
    erroPedido
  )

  return {
    sucesso: false,
    mensagem:
      'Não foi possível registrar o pedido.'
  }
}

const itensBanco =
  itensPedido.map(
    (item) => ({
      pedido_id:
        pedido.id,

      produto_id:
        item.produtoId,

      nome:
        item.nome,

      marca:
        item.marca,

      categoria:
        item.categoria,

      tamanho:
        item.tamanho,

      cor:
        item.cor,

      sku:
        item.sku,

      quantidade:
        item.quantidade,

      preco:
        item.preco,

      subtotal:
        item.subtotal
    })
  )

const {
  error: erroItens
} = await supabase
  .from('pedido_itens')
  .insert(
    itensBanco
  )

if (erroItens) {
  console.error(
    'Erro ao registrar itens:',
    erroItens
  )

  await supabase
    .from('pedidos')
    .delete()
    .eq(
      'id',
      pedido.id
    )

  return {
    sucesso: false,
    mensagem:
      'Não foi possível registrar os itens do pedido.'
  }
}

const movimentacoes = []

for (
  let i = 0;
  i < itensPedido.length;
  i += 1
) {
  const item =
    itensPedido[i]

  const produto =
    produtos.find(
      (produtoAtual) =>
        String(
          produtoAtual.id
        ) ===
        String(
          item.produtoId
        )
    )

  const estoqueAnterior =
    Number(
      produto.quantidade || 0
    )

  const estoqueAtual =
    estoqueAnterior -
    item.quantidade

  const {
    error: erroEstoque
  } = await supabase
    .from('produtos')
    .update({
      quantidade:
        estoqueAtual
    })
    .eq(
      'id',
      produto.id
    )

  if (erroEstoque) {
    console.error(
      'Erro ao atualizar estoque:',
      erroEstoque
    )
  }

  movimentacoes.push({
    id:
      Date.now() +
      i,

    produtoId:
      produto.id,

    produtoNome:
      produto.nome,

    tipo:
      'saida',

    quantidade:
      item.quantidade,

    estoqueAnterior,

    estoqueAtual,

    observacao:
      'Venda pelo aplicativo da loja',

    data:
      new Date().toISOString()
  })
}

await salvarMovimentacoes(
  movimentacoes
)

const pedidoCompleto = {
  ...pedido,

  nomeCliente:
    pedido.cliente,

  itens:
    itensPedido
}

return {
  sucesso: true,

  pedido:
    pedidoCompleto,

  produtos:
    await carregarProdutos()
}

} catch (erro) {
console.error(
'Erro ao registrar pedido:',
erro
)

return {
  sucesso: false,
  mensagem:
    'Ocorreu um erro ao registrar o pedido.'
}

}
}

// =====================================================
// ATUALIZAR STATUS
// =====================================================

export async function atualizarStatusPedido(
pedidoId,
novoStatus
) {
try {
const { error } =
await supabase
.from('pedidos')
.update({
status:
novoStatus
})
.eq(
'id',
Number(pedidoId)
)

if (error) {
  console.error(
    'Erro ao atualizar status:',
    error
  )

  throw error
}

return carregarPedidos()

} catch (erro) {
console.error(
'Erro ao atualizar status:',
erro
)

return carregarPedidos()

}
}

// =====================================================
// REMOVER PEDIDO
// =====================================================

export async function removerPedido(
pedidoId
) {
try {
const { error } =
await supabase
.from('pedidos')
.delete()
.eq(
'id',
Number(pedidoId)
)

if (error) {
  console.error(
    'Erro ao remover pedido:',
    error
  )

  throw error
}

return carregarPedidos()

} catch (erro) {
console.error(
'Erro ao remover pedido:',
erro
)

return carregarPedidos()

}
}