import { supabase } from './lib/supabase.js'
import { produtosIniciais } from './data/products.js'
import { agruparClientesDosPedidos } from './pages/clientesHelpers.js'
import { obterDataLocalHoje } from './lib/dataLocal.js'

const CHAVE_PRODUTOS =
  'meu_bazar_produtos'

const CHAVE_MOVIMENTACOES =
  'meu_bazar_movimentacoes'

// =====================================================
// AUXILIARES
// =====================================================

import {
  normalizarVariacoesProduto,
  normalizarVariacao
} from './pages/variacoesHelpers.js'

function normalizarProduto(
  produto
) {
  if (!produto) {
    return null
  }

  const variacoes = normalizarVariacoesProduto(produto)
  
  // Extrair todos os tamanhos consolidados de todas as variações
  const todosTamanhos = []
  const todasFotos = []

  for (const v of variacoes) {
    if (Array.isArray(v.fotos)) {
      for (const f of v.fotos) {
        todasFotos.push(f)
      }
    }
    if (Array.isArray(v.tamanhos)) {
      for (const t of v.tamanhos) {
        todosTamanhos.push(t)
      }
    }
  }

  // Se não houver fotos em variações, usa produto.foto ou produto.fotos
  const fotosFinais = todasFotos.length > 0
    ? todasFotos
    : Array.isArray(produto.fotos)
      ? produto.fotos
      : produto.foto
        ? [{ foto: produto.foto, ordem: 0 }]
        : []

  const tamanhosFinais = todosTamanhos.length > 0
    ? todosTamanhos
    : Array.isArray(produto.tamanhos)
      ? produto.tamanhos
      : []

  // Calcular quantidade total real = soma de TODAS as variações
  const somaTamanhos = tamanhosFinais.reduce(
    (acc, item) => acc + (Number(item.quantidade) || 0),
    0
  )
  let quantidadeCalculada = 0
  if (Array.isArray(produto.variacoes)) {
    quantidadeCalculada = somaTamanhos
  } else {
    quantidadeCalculada = somaTamanhos > 0 ? somaTamanhos : Math.max(0, Number(produto.quantidade || 0))
  }

  const fotoPrincipal = fotosFinais[0]?.foto || produto.foto || produto.imagem || produto.image || null

  return {
    ...produto,
    id: Number(produto.id),
    quantidade: quantidadeCalculada,
    custo: Number(produto.custo || 0),
    venda: Number(produto.venda || 0),
    peso_kg: Number(produto.peso_kg || 0.300),
    altura_cm: Number(produto.altura_cm || 4.00),
    largura_cm: Number(produto.largura_cm || 20.00),
    comprimento_cm: Number(produto.comprimento_cm || 25.00),
    ativo: produto.ativo !== false,
    nome: produto.nome || '',
    marca: produto.marca || '',
    categoria: produto.categoria || '',
    tamanho: produto.tamanho || tamanhosFinais.map((t) => t.tamanho).join(', '),
    cor: produto.cor || variacoes[0]?.cor_nome || '',
    sku: produto.sku || '',
    foto: fotoPrincipal,
    fotos: fotosFinais,
    tamanhos: tamanhosFinais,
    variacoes: variacoes
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
      produto.cor || (produto.variacoes && produto.variacoes[0]?.cor_nome) || '',

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

    peso_kg:
      Math.max(0.001, Number(produto.peso_kg || 0.300)),

    altura_cm:
      Math.max(1, Number(produto.altura_cm || 4.00)),

    largura_cm:
      Math.max(1, Number(produto.largura_cm || 20.00)),

    comprimento_cm:
      Math.max(1, Number(produto.comprimento_cm || 25.00)),

    foto:
      produto.foto ||
      produto.fotos?.[0]?.foto ||
      produto.variacoes?.[0]?.foto ||
      produto.imagem ||
      null,

    ativo:
      produto.ativo !== false
  }
}

// =====================================================
// CARREGAR VARIAÇÕES
// =====================================================

async function carregarVariacoesProduto(
  produtoId
) {
  try {
    const {
      data,
      error
    } = await supabase
      .from('produto_variacoes')
      .select('*')
      .eq('produto_id', Number(produtoId))
      .order('ordem', { ascending: true })

    if (error || !Array.isArray(data)) {
      return []
    }

    return data
  } catch (erro) {
    console.error('Erro ao carregar variações:', erro)
    return []
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
        id: item.id,
        produtoId: item.produto_id,
        variacao_id: item.variacao_id,
        cor: item.cor || 'Única',
        cor_hex: item.cor_hex || '#234B36',
        tamanho: item.tamanho || '',
        quantidade: Number(item.quantidade || 0)
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
// MONTAR PRODUTOS + VARIAÇÕES + FOTOS + TAMANHOS
// =====================================================

async function montarProdutosComDetalhes(
  produtos
) {
  const resultado = []

  for (
    const produto of produtos
  ) {
    const [
      variacoesBanco,
      fotosBanco,
      tamanhosBanco
    ] = await Promise.all([
      carregarVariacoesProduto(produto.id),
      carregarFotosProduto(produto.id),
      carregarTamanhosProduto(produto.id)
    ])

    let variacoesMontadas = []

    if (variacoesBanco.length > 0) {
      variacoesMontadas = variacoesBanco.map((vb, vIdx) => {
        const fotosVar = Array.isArray(vb.fotos) && vb.fotos.length > 0
          ? vb.fotos.map((f, fIdx) => (typeof f === 'string' ? { id: `fv-${vb.id}-${fIdx}`, foto: f, ordem: fIdx } : f))
          : fotosBanco.map((f, fIdx) => ({ id: f.id || `fb-${fIdx}`, foto: f.foto, ordem: f.ordem ?? fIdx }))

        const tamanhosVar = tamanhosBanco
          .filter((tb) => {
            if (tb.variacao_id != null) {
              return String(tb.variacao_id) === String(vb.id)
            }
            if (tb.cor && vb.cor_nome) {
              return String(tb.cor).trim().toLowerCase() === String(vb.cor_nome).trim().toLowerCase()
            }
            return vIdx === 0
          })
          .map((tb) => ({
            id: tb.id,
            variacao_id: vb.id,
            tamanho: tb.tamanho,
            quantidade: Number(tb.quantidade || 0)
          }))

        return normalizarVariacao({
          ...vb,
          fotos: fotosVar,
          tamanhos: tamanhosVar
        }, vIdx, produto.id)
      })
    } else if (tamanhosBanco.length > 0 && tamanhosBanco.some((tb) => tb.variacao_id == null)) {
      // Fallback SOMENTE para produto legado que possui linhas em produto_tamanhos sem variacao_id
      const varLegada = normalizarVariacao({
        id: `var-${produto.id}-0`,
        produto_id: produto.id,
        cor_nome: produto.cor || 'Única',
        cor_hex: '#234B36',
        fotos: fotosBanco.length > 0 ? fotosBanco : (produto.foto ? [{ foto: produto.foto, ordem: 0 }] : []),
        tamanhos: tamanhosBanco,
        quantidade: Math.max(0, Number(produto.quantidade || 0)),
        ativo: produto.ativo !== false,
        ordem: 0
      }, 0, produto.id)
      variacoesMontadas = [varLegada]
    } else {
      // Produto sem variações cadastradas (não sintetiza nova variação)
      variacoesMontadas = []
    }

    const produtoNormalizado = normalizarProduto({
      ...produto,
      variacoes: variacoesMontadas,
      fotos: fotosBanco,
      tamanhos: tamanhosBanco
    })

    if (produtoNormalizado) {
      resultado.push(produtoNormalizado)
    }
  }

  return resultado
}

// =====================================================
// CARREGAR PRODUTOS (BANCO + DETALHES)
// =====================================================

export async function carregarProdutos(incluirInativos = false) {
  try {
    let query = supabase
      .from('produtos')
      .select('*')
      .order('id', { ascending: false })

    if (!incluirInativos) {
      query = query.eq('ativo', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Erro ao carregar produtos do banco:', error)
      return carregarProdutosLocal()
    }

    if (!Array.isArray(data) || data.length === 0) {
      return []
    }

    return await montarProdutosComDetalhes(data)
  } catch (erro) {
    console.error('Erro geral ao carregar produtos:', erro)
    return carregarProdutosLocal()
  }
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
// SALVAR VARIAÇÕES E TAMANHOS
// =====================================================

async function salvarVariacoesETamanhos(
  produtoId,
  variacoes
) {
  try {
    const pId = Number(produtoId)

    // 1. Remover tamanhos antigos
    await supabase.from('produto_tamanhos').delete().eq('produto_id', pId)
    // 2. Remover fotos antigas
    await supabase.from('produto_fotos').delete().eq('produto_id', pId)
    // 3. Remover variações antigas
    await supabase.from('produto_variacoes').delete().eq('produto_id', pId)

    if (!Array.isArray(variacoes) || variacoes.length === 0) {
      await supabase
        .from('produtos')
        .update({ quantidade: 0, tamanho: '', cor: '' })
        .eq('id', pId)
      return
    }

    for (let idx = 0; idx < variacoes.length; idx++) {
      const v = variacoes[idx]
      const fotosJson = Array.isArray(v.fotos)
        ? v.fotos.map((f, fIdx) => (typeof f === 'string' ? { foto: f, ordem: fIdx } : { foto: f.foto || f.url || '', ordem: f.ordem ?? fIdx })).filter((f) => Boolean(f.foto))
        : v.foto ? [{ foto: v.foto, ordem: 0 }] : []

      const { data: varData, error: varError } = await supabase
        .from('produto_variacoes')
        .insert({
          produto_id: pId,
          cor_nome: (v.cor_nome || v.nome || v.cor || 'Única').trim(),
          cor_hex: (v.cor_hex || v.hex || '#234B36').trim(),
          fotos: fotosJson,
          ativo: v.ativo !== false,
          ordem: idx
        })
        .select()
        .single()

      if (varError) {
        console.error('Erro ao salvar variação:', varError)
        throw varError
      }

      const varId = varData.id

      // Inserir fotos no produto_fotos para compatibilidade geral
      for (const fotoItem of fotosJson) {
        await supabase.from('produto_fotos').insert({
          produto_id: pId,
          foto: fotoItem.foto,
          ordem: fotoItem.ordem
        })
      }

      // Inserir tamanhos da variação
      const tamanhosList = Array.isArray(v.tamanhos)
        ? v.tamanhos
        : typeof v.tamanhos === 'object' && v.tamanhos !== null
          ? Object.entries(v.tamanhos).map(([tam, qtd]) => ({ tamanho: tam, quantidade: qtd }))
          : []

      const tamanhosParaInserir = tamanhosList
        .filter((t) => t && t.tamanho)
        .map((t) => ({
          produto_id: pId,
          variacao_id: varId,
          cor: varData.cor_nome,
          cor_hex: varData.cor_hex,
          tamanho: String(t.tamanho).trim().toUpperCase(),
          quantidade: Math.max(0, Number(t.quantidade || 0))
        }))

      if (tamanhosParaInserir.length > 0) {
        const { error: tamError } = await supabase
          .from('produto_tamanhos')
          .insert(tamanhosParaInserir)

        if (tamError) {
          console.error('Erro ao salvar tamanhos da variação:', tamError)
          throw tamError
        }
      }
    }

    // Recalcular e sincronizar produtos.quantidade com a soma real de todas as grades
    const { data: todosOsTamanhos } = await supabase
      .from('produto_tamanhos')
      .select('quantidade')
      .eq('produto_id', pId)

    const totalConsolidado = (todosOsTamanhos || []).reduce(
      (acc, t) => acc + Number(t.quantidade || 0), 0
    )

    await supabase
      .from('produtos')
      .update({ quantidade: totalConsolidado })
      .eq('id', pId)
  } catch (erro) {
    console.error('Erro ao salvar variações e tamanhos:', erro)
    throw erro
  }
}

// =====================================================
// ADICIONAR PRODUTO
// =====================================================

export async function adicionarProduto(
  produto
) {
  const normalizado = normalizarProduto(produto)
  const novoProduto = {
    ...normalizado,
    id: normalizado.id || Date.now()
  }

  try {
    const produtoBanco = produtoParaBanco(novoProduto)

    const {
      data,
      error
    } = await supabase
      .from('produtos')
      .insert(produtoBanco)
      .select()
      .single()

    if (error) {
      console.error('Erro ao adicionar produto:', error)
      throw error
    }

    if (Array.isArray(novoProduto.variacoes)) {
      await salvarVariacoesETamanhos(data.id, novoProduto.variacoes)
    } else {
      await salvarFotosProduto(data.id, novoProduto.fotos)
      await salvarTamanhosProduto(data.id, novoProduto.tamanhos)
    }

    const [detalhes] = await montarProdutosComDetalhes([data])
    return detalhes || normalizarProduto(data)
  } catch (erro) {
    console.error('Erro ao adicionar produto:', erro)
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
    const normalizado = normalizarProduto(produtoAtualizado)
    const produtoBanco = produtoParaBanco(normalizado)

    const {
      data,
      error
    } = await supabase
      .from('produtos')
      .update(produtoBanco)
      .eq('id', Number(normalizado.id))
      .select()
      .single()

    if (error) {
      console.error('Erro ao atualizar produto:', error)
      throw error
    }

    if (Array.isArray(normalizado.variacoes)) {
      await salvarVariacoesETamanhos(data.id, normalizado.variacoes)
    } else {
      await salvarFotosProduto(data.id, normalizado.fotos)
      await salvarTamanhosProduto(data.id, normalizado.tamanhos)
    }

    const [detalhes] = await montarProdutosComDetalhes([data])
    return detalhes || normalizarProduto(data)
  } catch (erro) {
    console.error('Erro ao atualizar produto:', erro)
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
  variacaoId = null,
  tamanho = null,
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

    // Se tamanho foi especificado, atualiza na tabela produto_tamanhos
    if (tamanho) {
      let queryTam = supabase
        .from('produto_tamanhos')
        .select('*')
        .eq('produto_id', Number(produtoId))
        .eq('tamanho', String(tamanho).trim().toUpperCase())

      if (variacaoId) {
        queryTam = queryTam.eq('variacao_id', Number(variacaoId))
      }

      const { data: tamRows } = await queryTam

      if (tamRows && tamRows.length > 0) {
        const tamRow = tamRows[0]
        const novaQtdTam = Number(tamRow.quantidade || 0) + quantidadeEntrada
        await supabase
          .from('produto_tamanhos')
          .update({ quantidade: novaQtdTam })
          .eq('id', tamRow.id)
      } else {
        // Insere nova linha de tamanho
        await supabase
          .from('produto_tamanhos')
          .insert({
            produto_id: Number(produtoId),
            variacao_id: variacaoId ? Number(variacaoId) : null,
            tamanho: String(tamanho).trim().toUpperCase(),
            quantidade: quantidadeEntrada
          })
      }

      // Recalcula a soma total de tamanhos do produto
      const { data: todosTamanhos } = await supabase
        .from('produto_tamanhos')
        .select('quantidade')
        .eq('produto_id', Number(produtoId))

      const novoTotal = (todosTamanhos || []).reduce((acc, t) => acc + Number(t.quantidade || 0), 0)

      await supabase
        .from('produtos')
        .update({ quantidade: novoTotal })
        .eq('id', Number(produtoId))
    } else {
      const novoEstoque =
        estoqueAnterior +
        quantidadeEntrada

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
    }

    const { data: atualizado } = await supabase
      .from('produtos')
      .select('*')
      .eq('id', Number(produtoId))
      .single()

    const estoqueAtualFinal = Number(atualizado?.quantidade || 0)

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
        estoqueAtualFinal,

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
  variacaoId = null,
  tamanho = null,
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

    // Calcular estoque real a partir das grades
    const { data: todosOsTamanhos } = await supabase
      .from('produto_tamanhos')
      .select('quantidade')
      .eq('produto_id', Number(produtoId))

    const estoqueAnterior = (todosOsTamanhos || []).reduce(
      (acc, t) => acc + Number(t.quantidade || 0), 0
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

    // Se tamanho especificado, decrementar na grade
    if (tamanho) {
      let queryTam = supabase
        .from('produto_tamanhos')
        .select('*')
        .eq('produto_id', Number(produtoId))
        .eq('tamanho', String(tamanho).trim().toUpperCase())

      if (variacaoId) {
        queryTam = queryTam.eq('variacao_id', Number(variacaoId))
      }

      const { data: tamRows } = await queryTam

      if (tamRows && tamRows.length > 0) {
        const tamRow = tamRows[0]
        const novaQtdTam = Math.max(0, Number(tamRow.quantidade || 0) - quantidadeSaida)
        await supabase
          .from('produto_tamanhos')
          .update({ quantidade: novaQtdTam })
          .eq('id', tamRow.id)
      }
    }

    // Recalcular total do produto a partir de TODAS as grades
    const { data: tamanhosAtualizados } = await supabase
      .from('produto_tamanhos')
      .select('quantidade')
      .eq('produto_id', Number(produtoId))

    const novoEstoque = (tamanhosAtualizados || []).reduce(
      (acc, t) => acc + Number(t.quantidade || 0), 0
    )

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

        observacao_interna:
          pedido.observacao_interna ||
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

    pagamento_consulta_token:
      pedido?.pagamento_consulta_token ||
      pedido?.consulta_token ||
      null,

    consulta_token:
      pedido?.pagamento_consulta_token ||
      pedido?.consulta_token ||
      null,

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

      variacao_id:
        item.variacao_id != null && item.variacao_id !== '' && !String(item.variacao_id).startsWith('var-')
          ? Number(item.variacao_id)
          : null,

      cor: item.cor || null,
      cor_hex: item.cor_hex || null,

      tamanho:
        (item.tamanhoSelecionado || item.tamanho)
          ? String(item.tamanhoSelecionado || item.tamanho).trim().toUpperCase()
          : null,

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

export async function consultarPedidoPublico({ codigo, numero, email }) {
  try {
    const { data, error } = await supabase.functions.invoke(
      'consultar-pedido-publico',
      {
        body: {
          codigo: codigo ? String(codigo).trim().toUpperCase() : undefined,
          numero: numero ? String(numero).trim().toUpperCase() : undefined,
          email: email ? String(email).trim().toLowerCase() : undefined
        }
      }
    )

    if (error || !data?.sucesso || !data?.pedido) {
      return {
        sucesso: false,
        mensagem: data?.mensagem || 'Pedido não encontrado ou código inválido.'
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
      p_codigo_rastreio: dadosEnvio.codigoRastreio || dadosEnvio.codigo_rastreio || null,
      p_url_rastreio: dadosEnvio.urlRastreio || dadosEnvio.url_rastreio || null,
      p_observacao_envio: dadosEnvio.observacao || dadosEnvio.observacao_envio || null,
      p_observacao_interna: dadosEnvio.observacaoInterna || dadosEnvio.observacao_interna || dadosEnvio.observacao || null,
      p_usuario_responsavel: dadosEnvio.usuarioResponsavel || dadosEnvio.usuario_responsavel || 'Admin'
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
    const id = Number(pedidoId)
    if (!id || Number.isNaN(id)) {
      throw new Error('ID do pedido inválido.')
    }

    // 1. Remove reservas de estoque associadas se existirem
    await supabase
      .from('reservas_estoque')
      .delete()
      .eq('pedido_id', id)

    // 2. Remove itens do pedido se existirem
    await supabase
      .from('pedido_itens')
      .delete()
      .eq('pedido_id', id)

    // 3. Remove o pedido
    const {
      error
    } = await supabase
      .from('pedidos')
      .delete()
      .eq('id', id)

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

// =====================================================
// REVENDAS E CONSIGNAÇÃO
// =====================================================

export async function carregarRevendedoras() {
  try {
    const { data, error } = await supabase
      .from('revendedoras')
      .select('*')
      .order('nome', { ascending: true })

    if (error) {
      console.error('Erro ao carregar revendedoras:', error)
      return []
    }

    return Array.isArray(data) ? data : []
  } catch (erro) {
    console.error('Erro inesperado ao carregar revendedoras:', erro)
    return []
  }
}

export async function salvarRevendedora(dados) {
  try {
    const payload = {
      nome: dados.nome?.trim(),
      telefone: dados.telefone?.trim() || null,
      whatsapp: dados.whatsapp?.trim() || null,
      email: dados.email?.trim()?.toLowerCase() || null,
      cpf_cnpj: dados.cpf_cnpj?.trim() || null,
      cidade: dados.cidade?.trim() || null,
      estado: dados.estado?.trim() || null,
      endereco: dados.endereco?.trim() || null,
      comissao_padrao: Number(dados.comissao_padrao ?? 20),
      periodicidade_acerto_dias: Number(dados.periodicidade_acerto_dias ?? 15),
      data_inicio: dados.data_inicio || obterDataLocalHoje(),
      observacoes: dados.observacoes?.trim() || null,
      status: dados.status || 'Ativa',
      usa_divisao_lucro: Boolean(dados.usa_divisao_lucro),
      percentual_lucro_revendedora: dados.usa_divisao_lucro ? Number(dados.percentual_lucro_revendedora ?? 0) : 0,
      atualizado_em: new Date().toISOString()
    }

    if (dados.id) {
      const { data, error } = await supabase
        .from('revendedoras')
        .update(payload)
        .eq('id', Number(dados.id))
        .select()
        .single()

      if (error) throw error
      return { sucesso: true, revendedora: data }
    } else {
      const { data, error } = await supabase
        .from('revendedoras')
        .insert(payload)
        .select()
        .single()

      if (error) throw error
      return { sucesso: true, revendedora: data }
    }
  } catch (erro) {
    console.error('Erro ao salvar revendedora:', erro)
    return { sucesso: false, mensagem: erro.message || 'Não foi possível salvar a revendedora.' }
  }
}

export function obterUrlFotoPublica(caminhoOuUrl) {
  if (!caminhoOuUrl || typeof caminhoOuUrl !== 'string') return null
  const limpo = caminhoOuUrl.trim()
  if (!limpo) return null
  if (
    limpo.startsWith('http://') ||
    limpo.startsWith('https://') ||
    limpo.startsWith('data:') ||
    limpo.startsWith('blob:')
  ) {
    return limpo
  }
  const path = limpo.startsWith('produtos/') ? limpo.substring('produtos/'.length) : limpo
  try {
    const { data } = supabase.storage.from('produtos').getPublicUrl(path)
    return data?.publicUrl || `https://vqfqqxzzdaqkbwtgzarh.supabase.co/storage/v1/object/public/produtos/${path.replace(/^\/+/, '')}`
  } catch {
    return `https://vqfqqxzzdaqkbwtgzarh.supabase.co/storage/v1/object/public/produtos/${path.replace(/^\/+/, '')}`
  }
}

async function enriquecerItensComFotos(itens) {
  if (!Array.isArray(itens) || itens.length === 0) return []
  try {
    const prodIds = [...new Set(itens.map((i) => Number(i.produto_id)).filter((id) => Boolean(id) && !isNaN(id)))]
    if (prodIds.length === 0) return itens

    const [resProds, resFotos, resVariacoes] = await Promise.all([
      supabase.from('produtos').select('id, nome, foto, cor').in('id', prodIds),
      supabase.from('produto_fotos').select('produto_id, foto, ordem').in('produto_id', prodIds).order('ordem', { ascending: true }),
      supabase.from('produto_variacoes').select('id, produto_id, cor_nome, cor_hex, fotos, ordem').in('produto_id', prodIds).order('ordem', { ascending: true })
    ])

    const prods = Array.isArray(resProds.data) ? resProds.data : []
    const fotos = Array.isArray(resFotos.data) ? resFotos.data : []
    const variacoes = Array.isArray(resVariacoes.data) ? resVariacoes.data : []

    const prodMap = new Map()
    for (const p of prods) {
      prodMap.set(Number(p.id), p)
    }

    const fotosPorProdMap = new Map()
    for (const f of fotos) {
      const pId = Number(f.produto_id)
      if (!fotosPorProdMap.has(pId)) {
        fotosPorProdMap.set(pId, [])
      }
      fotosPorProdMap.get(pId).push(f)
    }

    const variacoesPorProdMap = new Map()
    for (const v of variacoes) {
      const pId = Number(v.produto_id)
      if (!variacoesPorProdMap.has(pId)) {
        variacoesPorProdMap.set(pId, [])
      }
      variacoesPorProdMap.get(pId).push(v)
    }

    return itens.map((item) => {
      const pId = Number(item.produto_id)
      const p = prodMap.get(pId)
      const fotosDoProd = fotosPorProdMap.get(pId) || []
      const variacoesDoProd = variacoesPorProdMap.get(pId) || []

      // 1. Tentar encontrar a variação correspondente
      let fotoVariacao = null
      let varEncontrada = null

      if (item.variacao_id) {
        varEncontrada = variacoesDoProd.find((v) => Number(v.id) === Number(item.variacao_id))
      }
      if (!varEncontrada && item.cor) {
        varEncontrada = variacoesDoProd.find(
          (v) => String(v.cor_nome || '').trim().toLowerCase() === String(item.cor).trim().toLowerCase()
        )
      }

      if (varEncontrada) {
        if (Array.isArray(varEncontrada.fotos) && varEncontrada.fotos.length > 0) {
          const primeiraFoto = varEncontrada.fotos[0]
          const raw = typeof primeiraFoto === 'string' ? primeiraFoto : (primeiraFoto?.foto || primeiraFoto?.url)
          fotoVariacao = obterUrlFotoPublica(raw)
        } else if (varEncontrada.foto) {
          fotoVariacao = obterUrlFotoPublica(varEncontrada.foto)
        }
      }

      // 2. Foto principal do produto (primeira foto em produto_fotos ou campo produtos.foto)
      let fotoProduto = null
      if (fotosDoProd.length > 0) {
        fotoProduto = obterUrlFotoPublica(fotosDoProd[0]?.foto)
      }
      if (!fotoProduto && p?.foto) {
        fotoProduto = obterUrlFotoPublica(p.foto)
      }

      const fotoFinal = fotoVariacao || fotoProduto || null

      return {
        ...item,
        foto_variacao: fotoVariacao,
        foto_produto: fotoProduto,
        foto: fotoFinal
      }
    })
  } catch (err) {
    console.error('Erro ao enriquecer itens com fotos:', err)
    return itens
  }
}

export async function carregarRemessas(revendedoraId = null) {
  try {
    let query = supabase
      .from('revenda_remessas')
      .select('*, revendedoras(nome, comissao_padrao, telefone, whatsapp)')
      .order('criado_em', { ascending: false })

    if (revendedoraId) {
      query = query.eq('revendedora_id', Number(revendedoraId))
    }

    const { data: remessas, error } = await query

    if (error || !Array.isArray(remessas)) {
      console.error('Erro ao carregar remessas:', error)
      return []
    }

    const resultado = []
    for (const remessa of remessas) {
      const { data: itens, error: errItens } = await supabase
        .from('revenda_remessa_itens')
        .select('*')
        .eq('remessa_id', remessa.id)
        .order('id', { ascending: true })

      if (errItens) {
        console.error('Erro ao carregar itens da remessa:', errItens)
      }

      const itensEnriquecidos = await enriquecerItensComFotos(itens || [])

      resultado.push({
        ...remessa,
        revendedora_nome: remessa.revendedoras?.nome || 'Revendedora',
        itens: itensEnriquecidos
      })
    }

    return resultado
  } catch (erro) {
    console.error('Erro ao carregar remessas:', erro)
    return []
  }
}

export async function criarRemessaConsignacao({
  revendedoraId,
  itens,
  observacao = '',
  responsavel = '',
  frete = 0
}) {
  try {
    const { data, error } = await supabase.rpc('criar_remessa_consignacao', {
      p_revendedora_id: Number(revendedoraId),
      p_itens: itens,
      p_observacao: observacao || null,
      p_responsavel: responsavel || null,
      p_frete: Number(frete || 0)
    })

    if (error) {
      console.error('Erro na RPC criar_remessa_consignacao:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao criar remessa.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao criar remessa:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado ao criar remessa.' }
  }
}

export async function editarRemessaConsignacao({
  remessaId,
  observacao = '',
  responsavel = '',
  itens = [],
  frete = null
}) {
  try {
    const params = {
      p_remessa_id: Number(remessaId),
      p_observacao: observacao || null,
      p_responsavel: responsavel || null,
      p_itens: itens
    }
    if (frete !== null && frete !== undefined && frete !== '') {
      params.p_frete = Number(frete)
    }
    const { data, error } = await supabase.rpc('editar_remessa_consignacao', params)

    if (error) {
      console.error('Erro na RPC editar_remessa_consignacao:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao editar remessa.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao editar remessa:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado ao editar remessa.' }
  }
}

export async function excluirRemessaConsignacao({ remessaId }) {
  try {
    const idNum = Number(remessaId)
    if (!idNum || isNaN(idNum)) {
      return { sucesso: false, mensagem: 'Identificador de remessa inválido.' }
    }

    // 1. Tentar executar via RPC segura se disponível
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('excluir_remessa_consignacao', {
        p_remessa_id: idNum
      })
      if (!rpcError && rpcData) {
        return rpcData
      }
    } catch {
      // Continua para o fallback seguro no cliente
    }

    // 2. Validação A: Verificar se existem vendas vinculadas
    const { data: vendas, error: errVendas } = await supabase
      .from('revenda_vendas')
      .select('id')
      .eq('remessa_id', idNum)

    if (errVendas) throw errVendas
    if (Array.isArray(vendas) && vendas.length > 0) {
      return { sucesso: false, mensagem: 'Esta remessa possui vendas vinculadas e não pode ser excluída.' }
    }

    // 3. Validação B: Verificar se existem pagamentos vinculados
    const { data: pags, error: errPags } = await supabase
      .from('revenda_pagamentos')
      .select('id')
      .eq('remessa_id', idNum)

    if (errPags) throw errPags
    if (Array.isArray(pags) && pags.length > 0) {
      return { sucesso: false, mensagem: 'Esta remessa possui movimentações financeiras e não pode ser excluída.' }
    }

    // 4. Obter itens para devolver estoque
    const { data: itens, error: errItens } = await supabase
      .from('revenda_remessa_itens')
      .select('*')
      .eq('remessa_id', idNum)

    if (errItens) throw errItens

    if (Array.isArray(itens)) {
      for (const item of itens) {
        const qtd = Number(item.quantidade_enviada || 0)
        if (qtd > 0) {
          if (item.produto_tamanho_id) {
            const { data: tamObj } = await supabase
              .from('produto_tamanhos')
              .select('quantidade')
              .eq('id', Number(item.produto_tamanho_id))
              .maybeSingle()

            if (tamObj) {
              await supabase
                .from('produto_tamanhos')
                .update({ quantidade: Number(tamObj.quantidade || 0) + qtd })
                .eq('id', Number(item.produto_tamanho_id))
            }
          }

          if (item.produto_id) {
            const { data: prodObj } = await supabase
              .from('produtos')
              .select('quantidade')
              .eq('id', Number(item.produto_id))
              .maybeSingle()

            if (prodObj) {
              await supabase
                .from('produtos')
                .update({ quantidade: Number(prodObj.quantidade || 0) + qtd })
                .eq('id', Number(item.produto_id))
            }
          }
        }
      }
    }

    // 5. Excluir itens da remessa
    await supabase.from('revenda_remessa_itens').delete().eq('remessa_id', idNum)

    // 6. Excluir a remessa
    const { error: errDel } = await supabase.from('revenda_remessas').delete().eq('id', idNum)
    if (errDel) throw errDel

    return { sucesso: true, mensagem: 'Remessa excluída com sucesso e estoque devolvido.' }
  } catch (erro) {
    console.error('Erro ao excluir remessa:', erro)
    return { sucesso: false, mensagem: erro.message || 'Não foi possível excluir a remessa.' }
  }
}

export async function registrarVendaConsignada({
  remessaItemId,
  quantidade,
  precoUnitario,
  dataVenda,
  observacao = ''
}) {
  try {
    const { data, error } = await supabase.rpc('registrar_venda_consignada', {
      p_remessa_item_id: Number(remessaItemId),
      p_quantidade: Number(quantidade),
      p_preco_unitario: Number(precoUnitario),
      p_data_venda: dataVenda || new Date().toISOString(),
      p_observacao: observacao || null
    })

    if (error) {
      console.error('Erro na RPC registrar_venda_consignada:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao registrar venda.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao registrar venda:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado.' }
  }
}

export async function registrarVendasConsignadasLote({
  remessaItemId,
  vendas,
  dataVenda,
  observacao = '',
  percentualDesconto = 0
}) {
  try {
    const payloadVendas = Array.isArray(vendas)
      ? vendas.map((v) => ({
          quantidade: Number(v.quantidade),
          preco_unitario: Number(v.precoUnitario || v.preco_unitario)
        }))
      : []

    const { data, error } = await supabase.rpc('registrar_vendas_consignadas_lote', {
      p_remessa_item_id: Number(remessaItemId),
      p_vendas: payloadVendas,
      p_data_venda: dataVenda || new Date().toISOString(),
      p_observacao: observacao || null,
      p_percentual_desconto: Number(percentualDesconto || 0)
    })

    if (error) {
      console.error('Erro na RPC registrar_vendas_consignadas_lote:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao registrar vendas.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao registrar vendas em lote:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado ao registrar vendas.' }
  }
}

export async function registrarDevolucaoConsignada({
  remessaItemId,
  quantidade,
  motivo = ''
}) {
  try {
    const { data, error } = await supabase.rpc('registrar_devolucao_consignada', {
      p_remessa_item_id: Number(remessaItemId),
      p_quantidade: Number(quantidade),
      p_motivo: motivo || null
    })

    if (error) {
      console.error('Erro na RPC registrar_devolucao_consignada:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao registrar devolução.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao registrar devolução:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado.' }
  }
}

export async function carregarVendasRevendas(revendedoraId = null) {
  try {
    let query = supabase
      .from('revenda_vendas')
      .select('*, revendedoras(nome), revenda_remessas(numero)')
      .order('data_venda', { ascending: false })

    if (revendedoraId) {
      query = query.eq('revendedora_id', Number(revendedoraId))
    }

    const { data, error } = await query
    if (error) throw error
    return Array.isArray(data)
      ? data.map((v) => ({
          ...v,
          numero_remessa: v.numero_remessa || v.revenda_remessas?.numero || (v.remessa_id ? `REM-${String(v.remessa_id).padStart(6, '0')}` : 'REM-000000')
        }))
      : []
  } catch (erro) {
    console.error('Erro ao carregar vendas de revendas:', erro)
    return []
  }
}

export async function carregarAcertosRevendas(revendedoraId = null) {
  try {
    let query = supabase
      .from('revenda_acertos')
      .select('*, revendedoras(nome, telefone, whatsapp)')
      .order('data_vencimento', { ascending: false })

    if (revendedoraId) {
      query = query.eq('revendedora_id', Number(revendedoraId))
    }

    const { data, error } = await query
    if (error) throw error
    return Array.isArray(data) ? data : []
  } catch (erro) {
    console.error('Erro ao carregar acertos:', erro)
    return []
  }
}

export async function carregarPagamentosRevendas(revendedoraId = null) {
  try {
    let query = supabase
      .from('revenda_pagamentos')
      .select('*, revendedoras(nome), revenda_remessas(numero)')
      .order('data_pagamento', { ascending: false })

    if (revendedoraId) {
      query = query.eq('revendedora_id', Number(revendedoraId))
    }

    const { data, error } = await query
    if (error) throw error
    return Array.isArray(data) ? data : []
  } catch (erro) {
    console.error('Erro ao carregar pagamentos de revendas:', erro)
    return []
  }
}

export async function registrarPagamentoRevenda({
  revendedoraId,
  valor,
  formaPagamento,
  acertoId = null,
  dataPagamento = null,
  observacao = ''
}) {
  try {
    const { data, error } = await supabase.rpc('registrar_pagamento_acerto', {
      p_revendedora_id: Number(revendedoraId),
      p_valor: Number(valor),
      p_forma_pagamento: formaPagamento,
      p_acerto_id: acertoId ? Number(acertoId) : null,
      p_data_pagamento: dataPagamento || new Date().toISOString(),
      p_observacao: observacao || null
    })

    if (error) {
      console.error('Erro na RPC registrar_pagamento_acerto:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao registrar pagamento.' }
    }

    return data
  } catch (erro) {
    console.error('Erro ao registrar pagamento:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado.' }
  }
}

// =====================================================
// PORTAL DA REVENDEDORA & CONFERÊNCIA ADMINISTRATIVA
// =====================================================

export async function carregarPerfilRevendedoraLogada(authUserId) {
  try {
    if (!authUserId) return null
    const { data, error } = await supabase
      .from('revendedoras')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle()

    if (error) {
      console.error('Erro ao carregar perfil da revendedora:', error)
      return null
    }
    return data || null
  } catch (erro) {
    console.error('Erro inesperado ao carregar perfil da revendedora:', erro)
    return null
  }
}

export async function carregarDadosPortalRevendedora(revendedoraId) {
  try {
    if (!revendedoraId) return null

    const [resRemessas, resVendas, resAcertos, resPagamentos, resDevolucoes, resRevendedora] = await Promise.all([
      supabase
        .from('revenda_remessas')
        .select('*, revendedoras(nome, comissao_padrao, telefone, whatsapp, usa_divisao_lucro, percentual_lucro_revendedora)')
        .eq('revendedora_id', Number(revendedoraId))
        .order('criado_em', { ascending: false }),
      supabase
        .from('revenda_vendas')
        .select('*')
        .eq('revendedora_id', Number(revendedoraId))
        .order('data_venda', { ascending: false }),
      supabase
        .from('revenda_acertos')
        .select('*')
        .eq('revendedora_id', Number(revendedoraId))
        .order('data_vencimento', { ascending: false }),
      supabase
        .from('revenda_pagamentos')
        .select('*')
        .eq('revendedora_id', Number(revendedoraId))
        .order('data_pagamento', { ascending: false }),
      supabase
        .from('revenda_devolucoes')
        .select('*')
        .eq('revendedora_id', Number(revendedoraId))
        .order('data_devolucao', { ascending: false }),
      supabase
        .from('revendedoras')
        .select('*')
        .eq('id', Number(revendedoraId))
        .single()
    ])

    const remessasRaw = Array.isArray(resRemessas.data) ? resRemessas.data : []
    const remessasComItens = []

    for (const rem of remessasRaw) {
      const { data: itens, error: errItens } = await supabase
        .from('revenda_remessa_itens')
        .select('*')
        .eq('remessa_id', rem.id)
        .order('id', { ascending: true })

      if (errItens) {
        console.error('Erro ao carregar itens da remessa no portal:', errItens)
      }

      const itensEnriquecidos = await enriquecerItensComFotos(itens || [])

      remessasComItens.push({
        ...rem,
        itens: itensEnriquecidos
      })
    }

    return {
      revendedora: resRevendedora.data || null,
      remessas: remessasComItens,
      vendas: Array.isArray(resVendas.data) ? resVendas.data : [],
      acertos: Array.isArray(resAcertos.data) ? resAcertos.data : [],
      pagamentos: Array.isArray(resPagamentos.data) ? resPagamentos.data : [],
      devolucoes: Array.isArray(resDevolucoes.data) ? resDevolucoes.data : []
    }
  } catch (erro) {
    console.error('Erro inesperado ao carregar dados do portal da revendedora:', erro)
    return null
  }
}

export async function registrarVendaPortal({
  remessaItemId,
  quantidade,
  precoUnitario,
  formaPagamento = 'Pix',
  dataVenda = null,
  observacao = '',
  percentualDesconto = 0,
  valorDesconto = 0,
  idempotencyKey = null
}) {
  try {
    const { data, error } = await supabase.rpc('registrar_venda_portal_revendedora', {
      p_remessa_item_id: Number(remessaItemId),
      p_quantidade: Number(quantidade),
      p_preco_unitario: Number(precoUnitario),
      p_forma_pagamento: formaPagamento,
      p_data_venda: dataVenda || new Date().toISOString(),
      p_observacao: observacao || null,
      p_percentual_desconto: Number(percentualDesconto || 0),
      p_idempotency_key: idempotencyKey || null,
      p_valor_desconto: Number(valorDesconto || 0)
    })

    if (error) {
      console.error('Erro na RPC registrar_venda_portal_revendedora:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao registrar venda.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao registrar venda no portal:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado ao registrar venda.' }
  }
}

// Data em que o dinheiro da venda cai (marketplace etc.). null = recebe na hora.
export async function definirDataRecebimentoVenda({ vendaId, dataRecebimento = null }) {
  try {
    const { data, error } = await supabase.rpc('definir_data_recebimento_venda', {
      p_venda_id: Number(vendaId),
      p_data_recebimento: dataRecebimento || null
    })
    if (error) {
      console.error('Erro na RPC definir_data_recebimento_venda:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao salvar a data de recebimento.' }
    }
    return data
  } catch (erro) {
    console.error('Erro inesperado ao salvar data de recebimento:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado ao salvar a data de recebimento.' }
  }
}

export async function editarVendaPortal({
  vendaId,
  quantidade,
  precoUnitario,
  valorDesconto = 0,
  formaPagamento = 'Pix',
  dataVenda = null,
  observacao = '',
  percentualDesconto = 0
}) {
  try {
    const { data, error } = await supabase.rpc('editar_venda_portal_revendedora', {
      p_venda_id: Number(vendaId),
      p_quantidade: Number(quantidade),
      p_preco_unitario: Number(precoUnitario),
      p_valor_desconto: Number(valorDesconto || 0),
      p_forma_pagamento: formaPagamento,
      p_data_venda: dataVenda || null,
      p_observacao: observacao || null,
      p_percentual_desconto: Number(percentualDesconto || 0)
    })

    if (error) {
      console.error('Erro na RPC editar_venda_portal_revendedora:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao editar venda.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao editar venda no portal:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado ao editar venda.' }
  }
}

export async function cancelarVendaPortal({ vendaId, motivo = '' }) {
  try {
    const { data, error } = await supabase.rpc('cancelar_venda_portal_revendedora', {
      p_venda_id: Number(vendaId),
      p_motivo: motivo || null
    })

    if (error) {
      console.error('Erro na RPC cancelar_venda_portal_revendedora:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao cancelar venda.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao cancelar venda no portal:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado ao cancelar venda.' }
  }
}

export async function informarPagamentoPortal({
  valor,
  dataPagamento = null,
  formaPagamento = 'Pix',
  remessaId = null,
  observacao = '',
  comprovanteRef = null,
  idempotencyKey = null
}) {
  try {
    const { data, error } = await supabase.rpc('informar_pagamento_portal_revendedora', {
      p_valor: Number(valor),
      p_data_pagamento: dataPagamento || new Date().toISOString(),
      p_forma_pagamento: formaPagamento || 'Pix',
      p_remessa_id: remessaId ? Number(remessaId) : null,
      p_observacao: observacao || null,
      p_comprovante_ref: comprovanteRef || null,
      p_idempotency_key: idempotencyKey || null
    })

    if (error) {
      console.error('Erro na RPC informar_pagamento_portal_revendedora:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao informar pagamento.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao informar pagamento no portal:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado ao informar pagamento.' }
  }
}

export async function carregarPagamentosAguardandoConfirmacao() {
  try {
    const { data, error } = await supabase
      .from('revenda_pagamentos')
      .select('*, revendedoras(nome, telefone, whatsapp), revenda_remessas(numero)')
      .eq('status', 'AGUARDANDO_CONFIRMACAO')
      .order('data_pagamento', { ascending: false })

    if (error) {
      console.error('Erro ao carregar pagamentos aguardando confirmação:', error)
      return []
    }

    return Array.isArray(data) ? data : []
  } catch (erro) {
    console.error('Erro inesperado ao carregar pagamentos pendentes:', erro)
    return []
  }
}

export async function confirmarPagamentoRevendedoraAdmin({
  pagamentoId,
  valorConfirmado = null,
  observacao = null
}) {
  try {
    const { data, error } = await supabase.rpc('confirmar_pagamento_revendedora_admin', {
      p_pagamento_id: Number(pagamentoId),
      p_valor_confirmado: valorConfirmado != null ? Number(valorConfirmado) : null,
      p_observacao: observacao || null
    })

    if (error) {
      console.error('Erro na RPC confirmar_pagamento_revendedora_admin:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao confirmar pagamento.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao confirmar pagamento:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado.' }
  }
}

export async function recusarPagamentoRevendedoraAdmin({ pagamentoId, motivoRecusa }) {
  try {
    const { data, error } = await supabase.rpc('recusar_pagamento_revendedora_admin', {
      p_pagamento_id: Number(pagamentoId),
      p_motivo_recusa: motivoRecusa
    })

    if (error) {
      console.error('Erro na RPC recusar_pagamento_revendedora_admin:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao recusar pagamento.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao recusar pagamento:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado.' }
  }
}

export async function carregarVendasAguardandoConferencia() {
  try {
    const { data, error } = await supabase
      .from('revenda_vendas')
      .select('*, revendedoras(nome, telefone, whatsapp)')
      .eq('status', 'AGUARDANDO_CONFERENCIA')
      .order('data_venda', { ascending: false })

    if (error) {
      console.error('Erro ao carregar vendas aguardando conferência:', error)
      return []
    }

    return Array.isArray(data) ? data : []
  } catch (erro) {
    console.error('Erro inesperado ao carregar vendas aguardando conferência:', erro)
    return []
  }
}

export async function confirmarVendaRevendedoraAdmin({
  vendaId,
  quantidade = null,
  precoUnitario = null,
  dataVenda = null,
  formaPagamento = null,
  observacao = null,
  percentualDesconto = null
}) {
  try {
    const payload = {
      p_venda_id: Number(vendaId),
      p_quantidade: quantidade != null ? Number(quantidade) : null,
      p_preco_unitario: precoUnitario != null ? Number(precoUnitario) : null,
      p_data_venda: dataVenda || null,
      p_forma_pagamento: formaPagamento || null,
      p_observacao: observacao || null,
      p_percentual_desconto: percentualDesconto != null ? Number(percentualDesconto) : null
    }

    const { data, error } = await supabase.rpc('confirmar_venda_revendedora', payload)

    if (error) {
      console.error('Erro na RPC confirmar_venda_revendedora:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao confirmar venda.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao confirmar venda:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado.' }
  }
}

export async function recusarVendaRevendedoraAdmin({ vendaId, motivo = '' }) {
  try {
    const { data, error } = await supabase.rpc('recusar_venda_revendedora', {
      p_venda_id: Number(vendaId),
      p_motivo: motivo || null
    })

    if (error) {
      console.error('Erro na RPC recusar_venda_revendedora:', error)
      return { sucesso: false, mensagem: error.message || 'Erro ao recusar venda.' }
    }

    return data
  } catch (erro) {
    console.error('Erro inesperado ao recusar venda:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro inesperado.' }
  }
}

export async function consultarAcessoRevendedora(revendedoraId) {
  try {
    const { data, error } = await supabase.functions.invoke('admin-gerenciar-usuarios', {
      body: {
        acao: 'revendedora_consultar_acesso',
        revendedora_id: Number(revendedoraId)
      }
    })

    if (error) {
      console.error('Erro ao consultar acesso da revendedora:', error)
      return {
        sucesso: false,
        erro: 'Não foi possível consultar os dados de acesso da revendedora.',
        erroTecnico: error.message
      }
    }
    return data
  } catch (erro) {
    console.error('Erro inesperado ao consultar acesso da revendedora:', erro)
    return {
      sucesso: false,
      erro: 'Não foi possível consultar os dados de acesso da revendedora.',
      erroTecnico: erro?.message
    }
  }
}

export async function criarAcessoRevendedora({ revendedoraId, email, senha }) {
  try {
    const { data, error } = await supabase.functions.invoke('admin-gerenciar-usuarios', {
      body: {
        acao: 'revendedora_criar_acesso',
        revendedora_id: Number(revendedoraId),
        email,
        senha
      }
    })

    if (error) {
      console.error('Erro técnico na Edge Function ao criar acesso:', error)
      let mensagemAmigavel = 'Não foi possível criar o acesso da revendedora. Tente novamente.'
      if (error.message && !error.message.includes('Failed to send a request') && !error.message.includes('non-2xx')) {
        mensagemAmigavel = error.message
      }
      return { sucesso: false, erro: mensagemAmigavel, erroTecnico: error.message }
    }

    if (!data?.sucesso) {
      return {
        sucesso: false,
        erro: data?.erro || 'Não foi possível criar o acesso da revendedora. Tente novamente.'
      }
    }

    return data
  } catch (erro) {
    console.error('Exceção ao criar acesso da revendedora:', erro)
    return {
      sucesso: false,
      erro: 'Não foi possível criar o acesso da revendedora. Tente novamente.',
      erroTecnico: erro?.message
    }
  }
}

export async function redefinirSenhaRevendedora({ revendedoraId, novaSenha = '' }) {
  try {
    const { data, error } = await supabase.functions.invoke('admin-gerenciar-usuarios', {
      body: {
        acao: 'revendedora_redefinir_senha',
        revendedora_id: Number(revendedoraId),
        nova_senha: novaSenha || undefined
      }
    })

    if (error) {
      console.error('Erro ao redefinir senha da revendedora:', error)
      return {
        sucesso: false,
        erro: 'Não foi possível redefinir a senha da revendedora. Tente novamente.',
        erroTecnico: error.message
      }
    }

    if (!data?.sucesso) {
      return {
        sucesso: false,
        erro: data?.erro || 'Não foi possível redefinir a senha da revendedora.'
      }
    }

    return data
  } catch (erro) {
    console.error('Exceção ao redefinir senha da revendedora:', erro)
    return {
      sucesso: false,
      erro: 'Não foi possível redefinir a senha da revendedora. Tente novamente.',
      erroTecnico: erro?.message
    }
  }
}

export async function alterarStatusAcessoRevendedora({ revendedoraId, statusAcesso }) {
  try {
    const { data, error } = await supabase.functions.invoke('admin-gerenciar-usuarios', {
      body: {
        acao: 'revendedora_alterar_status_acesso',
        revendedora_id: Number(revendedoraId),
        status_acesso: statusAcesso
      }
    })

    if (error) {
      console.error('Erro ao alterar status de acesso da revendedora:', error)
      return {
        sucesso: false,
        erro: 'Não foi possível alterar o status de acesso da revendedora. Tente novamente.',
        erroTecnico: error.message
      }
    }

    if (!data?.sucesso) {
      return {
        sucesso: false,
        erro: data?.erro || 'Não foi possível alterar o status de acesso.'
      }
    }

    return data
  } catch (erro) {
    console.error('Exceção ao alterar status de acesso da revendedora:', erro)
    return {
      sucesso: false,
      erro: 'Não foi possível alterar o status de acesso da revendedora. Tente novamente.',
      erroTecnico: erro?.message
    }
  }
}

// =====================================================
// GESTÃO DE USUÁRIOS E PERMISSÕES ADMINISTRATIVAS
// =====================================================

export async function carregarPerfilAdmin(userId, email) {
  try {
    let query = supabase.from('admin_usuarios').select('*')
    if (userId) {
      query = query.eq('user_id', userId)
    } else if (email) {
      query = query.eq('email', email.toLowerCase().trim())
    }

    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return data || null
  } catch (erro) {
    console.error('Erro ao carregar perfil do admin:', erro)
    return null
  }
}

export async function carregarUsuariosAdmin() {
  try {
    const { data, error } = await supabase.functions.invoke('admin-gerenciar-usuarios', {
      body: { acao: 'listar' }
    })

    if (error) {
      console.warn('Fallback para consulta direta admin_usuarios:', error)
      const { data: usuariosDireto, error: errDir } = await supabase
        .from('admin_usuarios')
        .select('*')
        .order('criado_em', { ascending: true })

      if (errDir) throw errDir
      return Array.isArray(usuariosDireto) ? usuariosDireto : []
    }

    return Array.isArray(data?.usuarios) ? data.usuarios : []
  } catch (erro) {
    console.error('Erro ao carregar usuários admin:', erro)
    return []
  }
}

export async function adicionarUsuarioAdmin({ nome, email, papel, enviarConvite = true }) {
  try {
    const { data, error } = await supabase.functions.invoke('admin-gerenciar-usuarios', {
      body: {
        acao: 'adicionar',
        nome,
        email,
        papel,
        enviarConvite
      }
    })

    if (error) throw error
    return data
  } catch (erro) {
    console.error('Erro ao adicionar usuário admin:', erro)
    throw erro
  }
}

export async function alterarPapelUsuarioAdmin(id, papel) {
  try {
    const { data, error } = await supabase.functions.invoke('admin-gerenciar-usuarios', {
      body: {
        acao: 'alterar_papel',
        id,
        papel
      }
    })

    if (error) throw error
    return data
  } catch (erro) {
    console.error('Erro ao alterar papel do usuário admin:', erro)
    throw erro
  }
}

export async function alterarStatusUsuarioAdmin(id, ativo) {
  try {
    const { data, error } = await supabase.functions.invoke('admin-gerenciar-usuarios', {
      body: {
        acao: 'alterar_status',
        id,
        ativo
      }
    })

    if (error) throw error
    return data
  } catch (erro) {
    console.error('Erro ao alterar status do usuário admin:', erro)
    throw erro
  }
}

export async function removerUsuarioAdmin(id) {
  try {
    const { data, error } = await supabase.functions.invoke('admin-gerenciar-usuarios', {
      body: {
        acao: 'remover',
        id
      }
    })

    if (error) throw error
    return data
  } catch (erro) {
    console.error('Erro ao remover usuário admin:', erro)
    throw erro
  }
}

export async function reenviarConviteUsuarioAdmin(email) {
  try {
    const { data, error } = await supabase.functions.invoke('admin-gerenciar-usuarios', {
      body: {
        acao: 'reenviar_convite',
        email
      }
    })

    if (error) throw error
    return data
  } catch (erro) {
    console.error('Erro ao reenviar convite admin:', erro)
    throw erro
  }
}

// =====================================================
// MÓDULO VENDA DIRETA (PDV WHATSAPP)
// =====================================================

export async function criarVendaDireta({
  cliente,
  telefone,
  email,
  itens,
  modalidadeEntrega,
  dadosEntrega,
  formaPagamento,
  observacaoInterna,
  atendente,
  idempotencyKey
}) {
  try {
    const { data, error } = await supabase.rpc('criar_venda_direta', {
      p_cliente: cliente,
      p_telefone: telefone,
      p_email: email || null,
      p_itens: itens,
      p_modalidade_entrega: modalidadeEntrega || 'correios',
      p_dados_entrega: dadosEntrega || {},
      p_forma_pagamento: formaPagamento || 'Pix',
      p_observacao_interna: observacaoInterna || null,
      p_atendente: atendente || null,
      p_idempotency_key: idempotencyKey || crypto.randomUUID()
    })

    if (error) {
      console.error('Erro na RPC criar_venda_direta:', error)
      return {
        sucesso: false,
        mensagem: error.message || 'Erro ao finalizar venda direta.'
      }
    }

    return {
      sucesso: true,
      pedido: data
    }
  } catch (erro) {
    console.error('Erro ao registrar venda direta:', erro)
    return {
      sucesso: false,
      mensagem: erro.message || 'Erro inesperado ao finalizar venda direta.'
    }
  }
}

export async function confirmarPagamentoPixVendaDireta(pedidoId, confirmadoPor) {
  try {
    const { data, error } = await supabase.rpc('confirmar_pagamento_pix_venda_direta', {
      p_pedido_id: Number(pedidoId),
      p_confirmado_por: confirmadoPor || 'Admin'
    })

    if (error) {
      console.error('Erro na RPC confirmar_pagamento_pix_venda_direta:', error)
      return {
        sucesso: false,
        mensagem: error.message || 'Erro ao confirmar pagamento Pix.'
      }
    }

    return {
      sucesso: true,
      ...data
    }
  } catch (erro) {
    console.error('Erro ao confirmar Pix:', erro)
    return {
      sucesso: false,
      mensagem: erro.message || 'Erro inesperado ao confirmar Pix.'
    }
  }
}

export async function gerarLinkPagamentoMercadoPago({ pedidoId, cliente, email, total, itens }) {
  try {
    const { data, error } = await supabase.functions.invoke('gerar-link-pagamento-mp', {
      body: {
        pedido_id: pedidoId,
        cliente,
        email,
        total,
        itens
      }
    })

    if (error || !data?.sucesso || !data?.link) {
      return {
        sucesso: false,
        mensagem: data?.mensagem || 'Não foi possível gerar o link do Mercado Pago.'
      }
    }

    return {
      sucesso: true,
      link: data.link
    }
  } catch (erro) {
    console.error('Erro ao gerar link de pagamento:', erro)
    return {
      sucesso: false,
      mensagem: erro.message || 'Erro ao comunicar com Mercado Pago.'
    }
  }
}

export async function carregarConfiguracaoPix() {
  try {
    const { data, error } = await supabase
      .from('configuracoes_loja')
      .select('*')
      .in('chave', ['pix_chave_fixa', 'pix_beneficiario', 'pix_cidade'])

    if (error) throw error

    const map = {}
    if (Array.isArray(data)) {
      data.forEach((row) => {
        map[row.chave] = row.valor
      })
    }

    return {
      chavePix: map.pix_chave_fixa || 'bazarencanto610@gmail.com',
      beneficiario: map.pix_beneficiario || 'Bazar Encanto Feminino',
      cidade: map.pix_cidade || 'São Paulo'
    }
  } catch (erro) {
    console.warn('Fallback configuracao Pix:', erro)
    return {
      chavePix: 'bazarencanto610@gmail.com',
      beneficiario: 'Bazar Encanto Feminino',
      cidade: 'São Paulo'
    }
  }
}

export async function salvarConfiguracaoLoja(chave, valor, descricao) {
  try {
    const { error } = await supabase
      .from('configuracoes_loja')
      .upsert({
        chave,
        valor,
        descricao: descricao || null,
        atualizado_em: new Date().toISOString()
      })

    if (error) throw error
    return { sucesso: true }
  } catch (erro) {
    console.error('Erro ao salvar configuração da loja:', erro)
    return { sucesso: false, mensagem: erro.message }
  }
}

export async function salvarRascunhoVendaDireta(rascunho) {
  try {
    const payload = {
      cliente: rascunho.cliente || '',
      telefone: rascunho.telefone || '',
      email: rascunho.email || null,
      itens: Array.isArray(rascunho.itens) ? rascunho.itens : [],
      entrega: rascunho.entrega || {},
      forma_pagamento: rascunho.formaPagamento || 'Pix',
      observacao: rascunho.observacao || null,
      atualizado_em: new Date().toISOString()
    }

    let resultado
    if (rascunho.id) {
      resultado = await supabase
        .from('vendas_diretas_rascunhos')
        .update(payload)
        .eq('id', rascunho.id)
        .select()
        .single()
    } else {
      resultado = await supabase
        .from('vendas_diretas_rascunhos')
        .insert({ ...payload, criado_em: new Date().toISOString() })
        .select()
        .single()
    }

    if (resultado.error) throw resultado.error
    return { sucesso: true, rascunho: resultado.data }
  } catch (erro) {
    console.error('Erro ao salvar rascunho:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro ao salvar rascunho.' }
  }
}

export async function carregarRascunhosVendaDireta() {
  try {
    const { data, error } = await supabase
      .from('vendas_diretas_rascunhos')
      .select('*')
      .order('atualizado_em', { ascending: false })

    if (error) throw error
    return Array.isArray(data) ? data : []
  } catch (erro) {
    console.error('Erro ao carregar rascunhos:', erro)
    return []
  }
}

export async function excluirRascunhoVendaDireta(id) {
  try {
    const { error } = await supabase
      .from('vendas_diretas_rascunhos')
      .delete()
      .eq('id', id)

    if (error) throw error
    return { sucesso: true }
  } catch (erro) {
    console.error('Erro ao excluir rascunho:', erro)
    return { sucesso: false, mensagem: erro.message }
  }
}

// =====================================================
// MÓDULO FINANCEIRO
// =====================================================

export async function carregarSocios() {
  try {
    const { data, error } = await supabase
      .from('financeiro_socios')
      .select('*')
      .order('nome', { ascending: true })

    if (error) throw error
    return Array.isArray(data) ? data : []
  } catch (erro) {
    console.error('Erro ao carregar sócios:', erro)
    return []
  }
}

export async function salvarSocio(dados) {
  try {
    const payload = {
      nome: dados.nome?.trim(),
      cpf: dados.cpf?.trim() || null,
      email: dados.email?.trim()?.toLowerCase() || null,
      telefone: dados.telefone?.trim() || null,
      participacao_percentual: Number(dados.participacao_percentual ?? 0),
      data_entrada: dados.data_entrada || obterDataLocalHoje(),
      status: dados.status || 'Ativo',
      observacao: dados.observacao?.trim() || null,
      atualizado_em: new Date().toISOString()
    }

    if (dados.id) {
      const { data, error } = await supabase
        .from('financeiro_socios')
        .update(payload)
        .eq('id', Number(dados.id))
        .select()
        .single()

      if (error) throw error
      return { sucesso: true, socio: data }
    } else {
      const { data, error } = await supabase
        .from('financeiro_socios')
        .insert(payload)
        .select()
        .single()

      if (error) throw error
      return { sucesso: true, socio: data }
    }
  } catch (erro) {
    console.error('Erro ao salvar sócio:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro ao salvar sócio.' }
  }
}

export async function carregarAportes(socioId = null) {
  try {
    let query = supabase
      .from('financeiro_aportes')
      .select('*, financeiro_socios(nome, status)')
      .order('data', { ascending: false })

    if (socioId) {
      query = query.eq('socio_id', Number(socioId))
    }

    const { data, error } = await query
    if (error) throw error
    return Array.isArray(data) ? data : []
  } catch (erro) {
    console.error('Erro ao carregar aportes:', erro)
    return []
  }
}

export async function salvarAporte(dados) {
  try {
    const rodadaNum = Number(dados.rodada_numero) || 1
    const rodadaNome = dados.rodada_nome?.trim() || `Aporte ${rodadaNum}`
    const payload = {
      socio_id: Number(dados.socio_id),
      valor: Number(dados.valor),
      data: dados.data || obterDataLocalHoje(),
      finalidade: dados.finalidade?.trim() || 'Compra de mercadoria',
      forma_pagamento: dados.forma_pagamento || 'Pix',
      observacao: dados.observacao?.trim() || null,
      rodada_numero: rodadaNum,
      rodada_nome: rodadaNome
    }

    const { data, error } = await supabase
      .from('financeiro_aportes')
      .insert(payload)
      .select()
      .single()

    if (error) throw error
    return { sucesso: true, aporte: data }
  } catch (erro) {
    console.error('Erro ao salvar aporte:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro ao registrar aporte.' }
  }
}

export async function carregarRetiradas(socioId = null) {
  try {
    let query = supabase
      .from('financeiro_retiradas')
      .select('*, financeiro_socios(nome, status)')
      .order('data', { ascending: false })

    if (socioId) {
      query = query.eq('socio_id', Number(socioId))
    }

    const { data, error } = await query
    if (error) throw error
    return Array.isArray(data) ? data : []
  } catch (erro) {
    console.error('Erro ao carregar retiradas:', erro)
    return []
  }
}

export async function salvarRetirada(dados) {
  try {
    const payload = {
      socio_id: Number(dados.socio_id),
      valor: Number(dados.valor),
      data: dados.data || obterDataLocalHoje(),
      tipo: dados.tipo || 'Distribuição de lucro',
      forma_pagamento: dados.forma_pagamento || 'Pix',
      observacao: dados.observacao?.trim() || null
    }

    const { data, error } = await supabase
      .from('financeiro_retiradas')
      .insert(payload)
      .select()
      .single()

    if (error) throw error
    return { sucesso: true, retirada: data }
  } catch (erro) {
    console.error('Erro ao salvar retirada:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro ao registrar retirada.' }
  }
}

export async function carregarCategoriasDespesa() {
  try {
    const { data, error } = await supabase
      .from('financeiro_categorias_despesa')
      .select('*')
      .eq('ativo', true)
      .order('nome', { ascending: true })

    if (error) throw error
    return Array.isArray(data) ? data : []
  } catch (erro) {
    console.error('Erro ao carregar categorias:', erro)
    return []
  }
}

export async function carregarDespesas() {
  try {
    const { data, error } = await supabase
      .from('financeiro_despesas')
      .select('*')
      .order('data', { ascending: false })

    if (error) throw error
    return Array.isArray(data) ? data : []
  } catch (erro) {
    console.error('Erro ao carregar despesas:', erro)
    return []
  }
}

export async function salvarDespesa(dados) {
  try {
    const payload = {
      descricao: dados.descricao?.trim(),
      categoria: dados.categoria?.trim() || 'Outros',
      valor: Number(dados.valor),
      data: dados.data || obterDataLocalHoje(),
      forma_pagamento: dados.forma_pagamento || 'Pix',
      observacao: dados.observacao?.trim() || null
    }

    if (dados.id) {
      const { data, error } = await supabase
        .from('financeiro_despesas')
        .update(payload)
        .eq('id', Number(dados.id))
        .select()
        .single()

      if (error) throw error
      return { sucesso: true, despesa: data }
    } else {
      const { data, error } = await supabase
        .from('financeiro_despesas')
        .insert(payload)
        .select()
        .single()

      if (error) throw error
      return { sucesso: true, despesa: data }
    }
  } catch (erro) {
    console.error('Erro ao salvar despesa:', erro)
    return { sucesso: false, mensagem: erro.message || 'Erro ao salvar despesa.' }
  }
}

export async function removerDespesa(id) {
  try {
    const { error } = await supabase
      .from('financeiro_despesas')
      .delete()
      .eq('id', Number(id))

    if (error) throw error
    return { sucesso: true }
  } catch (erro) {
    console.error('Erro ao remover despesa:', erro)
    return { sucesso: false, mensagem: erro.message }
  }
}



