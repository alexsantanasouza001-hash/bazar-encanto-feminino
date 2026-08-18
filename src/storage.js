import { supabase } from './lib/supabase.js'
import { produtosIniciais } from './data/products.js'
import { agruparClientesDosPedidos } from './pages/clientesHelpers.js'

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
      data_inicio: dados.data_inicio || new Date().toISOString().slice(0, 10),
      observacoes: dados.observacoes?.trim() || null,
      status: dados.status || 'Ativa',
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

      resultado.push({
        ...remessa,
        revendedora_nome: remessa.revendedoras?.nome || 'Revendedora',
        itens: Array.isArray(itens) ? itens : []
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
  responsavel = ''
}) {
  try {
    const { data, error } = await supabase.rpc('criar_remessa_consignacao', {
      p_revendedora_id: Number(revendedoraId),
      p_itens: itens,
      p_observacao: observacao || null,
      p_responsavel: responsavel || null
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
      .select('*, revendedoras(nome)')
      .order('data_venda', { ascending: false })

    if (revendedoraId) {
      query = query.eq('revendedora_id', Number(revendedoraId))
    }

    const { data, error } = await query
    if (error) throw error
    return Array.isArray(data) ? data : []
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
      .select('*, revendedoras(nome)')
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

