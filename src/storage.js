import { supabase } from './lib/supabase'
import { produtosIniciais } from './data/products'
import { agruparClientesDosPedidos } from './pages/clientesHelpers'

const CHAVE_PRODUTOS =
  'meu_bazar_produtos'

const CHAVE_MOVIMENTACOES =
  'meu_bazar_movimentacoes'

// =====================================================
// AUXILIARES
// =====================================================

function normalizarProduto(
  produto
) {
  if (!produto) {
    return null
  }

  return {
    ...produto,

    id:
      Number(produto.id),

    quantidade:
      Number(
        produto.quantidade || 0
      ),

    custo:
      Number(
        produto.custo || 0
      ),

    venda:
      Number(
        produto.venda || 0
      ),

    ativo:
      produto.ativo !== false,

    nome:
      produto.nome || '',

    marca:
      produto.marca || '',

    categoria:
      produto.categoria || '',

    tamanho:
      produto.tamanho || '',

    cor:
      produto.cor || '',

    sku:
      produto.sku || '',

    foto:
      produto.foto ||
      produto.imagem ||
      produto.image ||
      null,

    fotos:
      Array.isArray(
        produto.fotos
      )
        ? produto.fotos
        : produto.foto
          ? [
              {
                foto:
                  produto.foto,
                ordem: 0
              }
            ]
          : [],

    tamanhos:
      Array.isArray(
        produto.tamanhos
      )
        ? produto.tamanhos
        : []
  }
}

function produtoParaBanco(
  produto
) {
  return {
    id:
      Number(produto.id) ||
      Date.now(),

    nome:
      produto.nome || '',

    marca:
      produto.marca || '',

    categoria:
      produto.categoria || '',

    tamanho:
      produto.tamanho || '',

    cor:
      produto.cor || '',

    sku:
      produto.sku || '',

    quantidade:
      Number(
        produto.quantidade || 0
      ),

    custo:
      Number(
        produto.custo || 0
      ),

    venda:
      Number(
        produto.venda || 0
      ),

    foto:
      produto.foto ||
      produto.imagem ||
      produto.image ||
      null,

    ativo:
      produto.ativo !== false
  }
}

// =====================================================
// CARREGAR FOTOS
// =====================================================

async function carregarFotosProduto(
  produtoId
) {
  try {
    const {
      data,
      error
    } = await supabase
      .from('produto_fotos')
      .select('*')
      .eq(
        'produto_id',
        Number(produtoId)
      )
      .order('ordem', {
        ascending: true
      })

    if (
      error ||
      !Array.isArray(data)
    ) {
      return []
    }

    return data
  } catch (erro) {
    console.error(
      'Erro ao carregar fotos do produto:',
      erro
    )

    return []
  }
}

// =====================================================
// CARREGAR TAMANHOS
// =====================================================

async function carregarTamanhosProduto(
  produtoId
) {
  try {
    const {
      data,
      error
    } = await supabase
      .from('produto_tamanhos')
      .select('*')
      .eq(
        'produto_id',
        Number(produtoId)
      )
      .order('id', {
        ascending: true
      })

    if (
      error ||
      !Array.isArray(data)
    ) {
      return []
    }

    return data.map(
      (item) => ({
        id:
          item.id,

        produtoId:
          item.produto_id,

        tamanho:
          item.tamanho || '',

        quantidade:
          Number(
            item.quantidade || 0
          )
      })
    )
  } catch (erro) {
    console.error(
      'Erro ao carregar tamanhos:',
      erro
    )

    return []
  }
}

// =====================================================
// CARREGAR PRODUTOS
// =====================================================

function filtrarProdutosVisiveis(produtos, incluirInativos) {
  const lista = Array.isArray(produtos) ? produtos : []

  return incluirInativos
    ? lista
    : lista.filter((produto) => produto?.ativo !== false)
}

export async function carregarProdutos(incluirInativos = false) {
  try {
    const {
      data,
      error
    } = await supabase
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

      return incluirInativos ? carregarProdutosLocal() : []
    }

    if (
      !Array.isArray(data)
    ) {
      return incluirInativos ? carregarProdutosLocal() : []
    }

    if (data.length === 0) {
      const locais =
        carregarProdutosLocal()

      if (
        incluirInativos &&
        locais.length > 0
      ) {
        await migrarProdutos(
          locais
        )

        const resultado =
          await supabase
            .from('produtos')
            .select('*')
            .order('id', {
              ascending: false
            })

        if (
          !resultado.error &&
          Array.isArray(
            resultado.data
          )
        ) {
          const produtos =
            await montarProdutosComDetalhes(
              resultado.data
            )

          localStorage.setItem(
            CHAVE_PRODUTOS,
            JSON.stringify(
              produtos
            )
          )

          return filtrarProdutosVisiveis(produtos, incluirInativos)
        }
      }

      return []
    }

    const produtos =
      await montarProdutosComDetalhes(
        data
      )

    localStorage.setItem(
      CHAVE_PRODUTOS,
      JSON.stringify(
        produtos
      )
    )

    return filtrarProdutosVisiveis(produtos, incluirInativos)
  } catch (erro) {
    console.error(
      'Erro inesperado ao carregar produtos:',
      erro
    )

    return incluirInativos ? carregarProdutosLocal() : []
  }
}

// =====================================================
// MONTAR PRODUTOS + FOTOS + TAMANHOS
// =====================================================

async function montarProdutosComDetalhes(
  produtos
) {
  const resultado = []

  for (
    const produto of produtos
  ) {
    const normalizado =
      normalizarProduto(
        produto
      )

    if (!normalizado) {
      continue
    }

    const [
      fotos,
      tamanhos
    ] =
      await Promise.all([
        carregarFotosProduto(
          produto.id
        ),
        carregarTamanhosProduto(
          produto.id
        )
      ])

    normalizado.fotos =
      fotos

    normalizado.tamanhos =
      tamanhos

    if (
      fotos.length > 0
    ) {
      normalizado.foto =
        fotos[0].foto
    }

    if (
      tamanhos.length > 0
    ) {
      normalizado.tamanho =
        tamanhos
          .map(
            (item) =>
              item.tamanho
          )
          .join(', ')
    }

    resultado.push(
      normalizado
    )
  }

  return resultado
}

// =====================================================
// PRODUTOS LOCAIS
// =====================================================

function carregarProdutosLocal() {
  try {
    const dados =
      localStorage.getItem(
        CHAVE_PRODUTOS
      )

    if (!dados) {
      return Array.isArray(
        produtosIniciais
      )
        ? produtosIniciais.map(
            normalizarProduto
          )
        : []
    }

    const produtos =
      JSON.parse(dados)

    if (
      !Array.isArray(produtos)
    ) {
      return Array.isArray(
        produtosIniciais
      )
        ? produtosIniciais.map(
            normalizarProduto
          )
        : []
    }

    return produtos
      .map(
        normalizarProduto
      )
      .filter(Boolean)
  } catch (erro) {
    console.error(
      'Erro ao carregar produtos locais:',
      erro
    )

    return Array.isArray(
      produtosIniciais
    )
      ? produtosIniciais.map(
          normalizarProduto
        )
      : []
  }
}

// =====================================================
// MIGRAR PRODUTOS
// =====================================================

async function migrarProdutos(
  produtos
) {
  if (
    !Array.isArray(produtos) ||
    produtos.length === 0
  ) {
    return
  }

  try {
    const produtosBanco =
      produtos
        .map(
          produtoParaBanco
        )
        .filter(Boolean)

    const {
      error
    } = await supabase
      .from('produtos')
      .upsert(
        produtosBanco,
        {
          onConflict:
            'id'
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

// =====================================================
// SALVAR FOTOS
// =====================================================

async function salvarFotosProduto(
  produtoId,
  fotos
) {
  try {
    await supabase
      .from('produto_fotos')
      .delete()
      .eq(
        'produto_id',
        Number(produtoId)
      )

    if (
      !Array.isArray(fotos) ||
      fotos.length === 0
    ) {
      return
    }

    const registros =
      fotos
        .filter(
          (item) =>
            item &&
            item.foto
        )
        .map(
          (
            item,
            index
          ) => ({
            produto_id:
              Number(
                produtoId
              ),

            foto:
              item.foto,

            ordem:
              Number(
                item.ordem ??
                  index
              )
          })
        )

    if (
      registros.length ===
      0
    ) {
      return
    }

    const {
      error
    } = await supabase
      .from('produto_fotos')
      .insert(
        registros
      )

    if (error) {
      console.error(
        'Erro ao salvar fotos:',
        error
      )

      throw error
    }
  } catch (erro) {
    console.error(
      'Erro ao salvar fotos do produto:',
      erro
    )

    throw erro
  }
}

// =====================================================
// SALVAR TAMANHOS
// =====================================================

async function salvarTamanhosProduto(
  produtoId,
  tamanhos
) {
  try {
    await supabase
      .from('produto_tamanhos')
      .delete()
      .eq(
        'produto_id',
        Number(produtoId)
      )

    if (
      !Array.isArray(
        tamanhos
      ) ||
      tamanhos.length === 0
    ) {
      return
    }

    const registros =
      tamanhos
        .filter(
          (item) =>
            item &&
            item.tamanho &&
            Number(
              item.quantidade ||
                0
            ) > 0
        )
        .map(
          (item) => ({
            produto_id:
              Number(
                produtoId
              ),

            tamanho:
              item.tamanho,

            quantidade:
              Number(
                item.quantidade
              )
          })
        )

    if (
      registros.length ===
      0
    ) {
      return
    }

    const {
      error
    } = await supabase
      .from('produto_tamanhos')
      .insert(
        registros
      )

    if (error) {
      console.error(
        'Erro ao salvar tamanhos:',
        error
      )

      throw error
    }
  } catch (erro) {
    console.error(
      'Erro ao salvar tamanhos do produto:',
      erro
    )

    throw erro
  }
}

// =====================================================
// SALVAR PRODUTOS
// =====================================================

export async function salvarProdutos(
  produtos
) {
  if (
    !Array.isArray(produtos)
  ) {
    return []
  }

  try {
    const produtosBanco =
      produtos.map(
        produtoParaBanco
      )

    const {
      error
    } = await supabase
      .from('produtos')
      .upsert(
        produtosBanco,
        {
          onConflict:
            'id'
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
      JSON.stringify(
        produtos
      )
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

// =====================================================
// ADICIONAR PRODUTO
// =====================================================

export async function adicionarProduto(
  produto
) {
  const novoProduto = {
    ...produto,

    id:
      produto.id ||
      Date.now()
  }

  try {
    const produtoBanco =
      produtoParaBanco(
        novoProduto
      )

    const {
      data,
      error
    } = await supabase
      .from('produtos')
      .insert(
        produtoBanco
      )
      .select()
      .single()

    if (error) {
      console.error(
        'Erro ao adicionar produto:',
        error
      )

      throw error
    }

    await salvarFotosProduto(
      data.id,
      novoProduto.fotos
    )

    await salvarTamanhosProduto(
      data.id,
      novoProduto.tamanhos
    )

    return normalizarProduto({
      ...data,
      fotos:
        novoProduto.fotos ||
        [],
      tamanhos:
        novoProduto.tamanhos ||
        []
    })
  } catch (erro) {
    console.error(
      'Erro ao adicionar produto:',
      erro
    )

    throw erro
  }
}

// =====================================================
// ATUALIZAR PRODUTO
// =====================================================

export async function atualizarProduto(
  produtoAtualizado
) {
  try {
    const produtoBanco = {
      nome:
        produtoAtualizado.nome ||
        '',

      marca:
        produtoAtualizado.marca ||
        '',

      categoria:
        produtoAtualizado.categoria ||
        '',

      tamanho:
        Array.isArray(
          produtoAtualizado.tamanhos
        )
          ? produtoAtualizado.tamanhos
              .map(
                (item) =>
                  item.tamanho
              )
              .join(', ')
          : produtoAtualizado.tamanho ||
            '',

      cor:
        produtoAtualizado.cor ||
        '',

      sku:
        produtoAtualizado.sku ||
        '',

      quantidade:
        Number(
          produtoAtualizado.quantidade ||
            0
        ),

      custo:
        Number(
          produtoAtualizado.custo ||
            0
        ),

      venda:
        Number(
          produtoAtualizado.venda ||
            0
        ),

      foto:
        produtoAtualizado.foto ||
        produtoAtualizado.fotos?.[0]?.foto ||
        null
    }

    const {
      data,
      error
    } = await supabase
      .from('produtos')
      .update(
        produtoBanco
      )
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

    await salvarFotosProduto(
      produtoAtualizado.id,
      produtoAtualizado.fotos
    )

    await salvarTamanhosProduto(
      produtoAtualizado.id,
      produtoAtualizado.tamanhos
    )

    return normalizarProduto({
      ...data,
      fotos:
        produtoAtualizado.fotos ||
        [],
      tamanhos:
        produtoAtualizado.tamanhos ||
        []
    })
  } catch (erro) {
    console.error(
      'Erro ao atualizar produto:',
      erro
    )

    throw erro
  }
}

// =====================================================
// EXCLUIR PRODUTO
// =====================================================

export async function removerProduto(
  id
) {
  try {
    await supabase
      .from('produto_fotos')
      .delete()
      .eq(
        'produto_id',
        Number(id)
      )

    await supabase
      .from('produto_tamanhos')
      .delete()
      .eq(
        'produto_id',
        Number(id)
      )

    const {
      error
    } = await supabase
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

function normalizarMovimentacao(
  movimentacao
) {
  if (!movimentacao) {
    return null
  }

  return {
    id:
      Number(
        movimentacao.id
      ),

    produtoId:
      Number(
        movimentacao.produto_id ??
          movimentacao.produtoId ??
          0
      ),

    produtoNome:
      movimentacao.produto_nome ??
      movimentacao.produtoNome ??
      '',

    tipo:
      movimentacao.tipo ||
      '',

    quantidade:
      Number(
        movimentacao.quantidade ||
          0
      ),

    estoqueAnterior:
      Number(
        movimentacao.estoque_anterior ??
          movimentacao.estoqueAnterior ??
          0
      ),

    estoqueAtual:
      Number(
        movimentacao.estoque_atual ??
          movimentacao.estoqueAtual ??
          0
      ),

    observacao:
      movimentacao.observacao ||
      '',

    data:
      movimentacao.data ||
      new Date().toISOString()
  }
}

export async function carregarMovimentacoes() {
  try {
    const {
      data,
      error
    } = await supabase
      .from('movimentacoes')
      .select('*')
      .order('data', {
        ascending:
          false
      })

    if (error) {
      console.error(
        'Erro ao carregar movimentações:',
        error
      )

      return []
    }

    if (
      !Array.isArray(data)
    ) {
      return []
    }

    const movimentacoes =
      data
        .map(
          normalizarMovimentacao
        )
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
    !Array.isArray(
      movimentacoes
    )
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

      const {
        error
      } = await supabase
        .from('movimentacoes')
        .upsert(
          registro,
          {
            onConflict:
              'id'
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
    quantidadeEntrada <=
      0
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
        produto.quantidade ||
          0
      )

    const novoEstoque =
      estoqueAnterior +
      quantidadeEntrada

    const {
      data: atualizado,
      error: erroUpdate
    } =
      await supabase
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
    quantidadeSaida <=
      0
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
        produto.quantidade ||
          0
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
    } =
      await supabase
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
        ascending:
          false
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

        user_id:
          pedido.user_id ||
          null,

        email:
          pedido.email_cliente ||
          pedido.email ||
          '',

        email_cliente:
          pedido.email_cliente ||
          pedido.email ||
          '',

        telefone:
          pedido.telefone_cliente ||
          pedido.telefone ||
          '',

        telefone_cliente:
          pedido.telefone_cliente ||
          pedido.telefone ||
          '',

        cpf:
          pedido.cpf_cliente ||
          pedido.cpf ||
          '',

        cpf_cliente:
          pedido.cpf_cliente ||
          pedido.cpf ||
          '',

        cliente:
          pedido.cliente ||
          '',

        nomeCliente:
          pedido.cliente ||
          '',

        subtotal:
          Number(
            pedido.subtotal || 0
          ),

        desconto:
          Number(
            pedido.desconto || 0
          ),

        valor_frete:
          Number(
            pedido.valor_frete || 0
          ),

        regiao_frete:
          pedido.regiao_frete ||
          '',

        cep_entrega:
          pedido.cep_entrega ||
          '',

        endereco_entrega:
          pedido.endereco_entrega ||
          '',

        numero_entrega:
          pedido.numero_entrega ||
          '',

        complemento_entrega:
          pedido.complemento_entrega ||
          '',

        bairro_entrega:
          pedido.bairro_entrega ||
          '',

        cidade_entrega:
          pedido.cidade_entrega ||
          '',

        estado_entrega:
          pedido.estado_entrega ||
          '',

        forma_pagamento:
          pedido.forma_pagamento ||
          '',

        status_pagamento:
          pedido.status_pagamento ||
          '',

        pagamento_provider:
          pedido.pagamento_provider ||
          '',

        pagamento_id:
          pedido.pagamento_id ||
          '',

        pagamento_atualizado_em:
          pedido.pagamento_atualizado_em ||
          null,

        transportadora:
          pedido.transportadora ||
          '',

        codigo_rastreio:
          pedido.codigo_rastreio ||
          '',

        url_rastreio:
          pedido.url_rastreio ||
          '',

        enviado_em:
          pedido.enviado_em ||
          null,

        entregue_em:
          pedido.entregue_em ||
          null,

        atualizado_em:
          pedido.atualizado_em ||
          null,

        observacao_envio:
          pedido.observacao_envio ||
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

    return resultado
  } catch (erro) {
    console.error(
      'Erro ao carregar pedidos:',
      erro
    )

    return []
  }
}

export async function carregarClientes() {
  const pedidos = await carregarPedidos()
  return agruparClientesDosPedidos(pedidos)
}

// =====================================================
// REGISTRAR PEDIDO
// =====================================================


async function obterMensagemErroCriarPedido(erro, dados) {
  if (dados?.mensagem) {
    return dados.mensagem
  }

  try {
    const resposta =
      erro?.context

    if (resposta instanceof Response) {
      const corpo =
        await resposta.clone().json()

      if (corpo?.mensagem) {
        return corpo.mensagem
      }
    }
  } catch {
    // A resposta pode não conter JSON.
  }

  return (
    erro?.message ||
    'Não foi possível registrar o pedido.'
  )
}

export async function alterarAtivoProduto(produtoId, ativo) {
  const { error } = await supabase
    .from('produtos')
    .update({ ativo: Boolean(ativo) })
    .eq('id', Number(produtoId))

  if (error) throw error
  return carregarProdutos(true)
}

function normalizarPedidoCheckout(
  pedido
) {
  return {
    ...pedido,

    nomeCliente:
      pedido?.cliente ||
      '',

    subtotal:
      Number(
        pedido?.subtotal ||
        0
      ),

    desconto:
      Number(
        pedido?.desconto ||
        0
      ),

    valor_frete:
      Number(
        pedido?.valor_frete ||
        0
      ),

    regiao_frete:
      pedido?.regiao_frete ||
      '',

    cep_entrega:
      pedido?.cep_entrega ||
      '',

    endereco_entrega:
      pedido?.endereco_entrega ||
      '',

    numero_entrega:
      pedido?.numero_entrega ||
      '',

    complemento_entrega:
      pedido?.complemento_entrega ||
      '',

    bairro_entrega:
      pedido?.bairro_entrega ||
      '',

    cidade_entrega:
      pedido?.cidade_entrega ||
      '',

    estado_entrega:
      pedido?.estado_entrega ||
      '',

    total:
      Number(
        pedido?.total ||
        0
      ),

    itens:
      Array.isArray(
        pedido?.itens
      )
        ? pedido.itens.map(
            (item) => ({
              ...item,

              produtoId:
                item.produto_id,

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
  }
}

export async function registrarPagamento({
  email,
  cliente,
  itens,
  cupom = null,
  formaPagamento,
  dadosCartao = null,
  idempotencyKey
}) {
  if (
    !email ||
    !String(email).trim() ||
    !cliente?.nome ||
    !String(
      cliente.nome
    ).trim()
  ) {
    return {
      sucesso: false,
      mensagem:
        'Os dados da cliente são obrigatórios.'
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

  if (!idempotencyKey) {
    return {
      sucesso: false,
      mensagem:
        'Não foi possível identificar esta tentativa de pedido.'
    }
  }

  const itensCheckout =
    itens.map((item) => ({
      produto_id:
        Number(
          item.produto_id ??
          item.produtoId ??
          item.id
        ),

      tamanho:
        item.tamanhoSelecionado ||
        item.tamanho ||
        null,

      quantidade:
        Number(
          item.quantidade
        )
    }))

  try {
    const {
      data: {
        session
      },
      error: erroSessao
    } =
      await supabase.auth.getSession()

    if (erroSessao) {
      console.error(
        'Erro ao consultar sessão:',
        erroSessao
      )

      return {
        sucesso: false,
        mensagem:
          'Não foi possível validar a sessão atual.'
      }
    }

    const opcoes = {
      body: {
        email:
          String(email).trim(),

        cliente,

        itens:
          itensCheckout,

        cupom:
          cupom ||
          null,

        forma_pagamento:
          formaPagamento,

        cartao:
          formaPagamento ===
            'Cartão de crédito'
            ? {
                token:
                  dadosCartao?.token,

                payment_method_id:
                  dadosCartao
                    ?.payment_method_id,

                payment_type_id:
                  dadosCartao
                    ?.payment_type_id,

                installments:
                  dadosCartao
                    ?.installments
              }
            : null,

        idempotency_key:
          idempotencyKey
      }
    }

    if (
      session?.access_token
    ) {
      opcoes.headers = {
        Authorization:
          `Bearer ${session.access_token}`
      }
    }

    const {
      data,
      error
    } =
      await supabase.functions.invoke(
        'criar-pagamento',
        opcoes
      )

    if (
      error ||
      !data?.sucesso ||
      !data?.pedido
    ) {
      const mensagem =
        await obterMensagemErroCriarPedido(
          error,
          data
        )

      console.error(
        'Erro ao criar pedido:',
        error ||
        data
      )

      return {
        sucesso: false,
        mensagem,
        requerNovaTentativa:
          Boolean(
            data?.requer_nova_tentativa
          )
      }
    }

    return {
      sucesso: true,

      pedido:
        normalizarPedidoCheckout(
          data.pedido
        ),

      pagamento:
        data.pagamento ||
        null,

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

export async function consultarPagamento({
  numero,
  consultaToken
}) {
  try {
    const { data, error } =
      await supabase.functions.invoke(
        'consultar-pagamento',
        {
          body: {
            numero,
            consulta_token:
              consultaToken
          }
        }
      )

    if (
      error ||
      !data?.sucesso ||
      !data?.pedido
    ) {
      return {
        sucesso: false,
        mensagem:
          data?.mensagem ||
          'Não foi possível atualizar o pagamento agora.'
      }
    }

    return {
      sucesso: true,
      pedido:
        normalizarPedidoCheckout(
          data.pedido
        ),
      pagamento:
        data.pagamento ||
        null
    }
  } catch (erro) {
    console.error(
      'Erro ao consultar pagamento:',
      erro
    )

    return {
      sucesso: false,
      mensagem:
        'Não foi possível atualizar o pagamento agora.'
    }
  }
}

export async function consultarPedidoPublico({ numero, email }) {
  try {
    const { data, error } = await supabase.functions.invoke(
      'consultar-pedido-publico',
      {
        body: {
          numero: String(numero || '').trim().toUpperCase(),
          email: String(email || '').trim().toLowerCase()
        }
      }
    )

    if (error || !data?.sucesso || !data?.pedido) {
      return {
        sucesso: false,
        mensagem: data?.mensagem || 'Pedido não encontrado ou dados inválidos.'
      }
    }

    return { sucesso: true, pedido: data.pedido }
  } catch (erro) {
    console.error('Erro ao acompanhar pedido:', erro)
    return {
      sucesso: false,
      mensagem: 'Não foi possível consultar o pedido agora.'
    }
  }
}

// =====================================================
// ATUALIZAR STATUS
// =====================================================

export async function atualizarStatusPedido(
  pedidoId,
  novoStatus,
  dadosEnvio = {}
) {
  try {
    const { error } = await supabase.rpc('atualizar_pedido_pos_venda', {
      p_pedido_id: Number(pedidoId),
      p_novo_status: novoStatus,
      p_transportadora: dadosEnvio.transportadora || null,
      p_codigo_rastreio: dadosEnvio.codigoRastreio || null,
      p_url_rastreio: dadosEnvio.urlRastreio || null,
      p_observacao_envio: dadosEnvio.observacao || null
    })

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

    throw erro
  }
}

// =====================================================
// REMOVER PEDIDO
// =====================================================

export async function removerPedido(
  pedidoId
) {
  try {
    const {
      error
    } = await supabase
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
