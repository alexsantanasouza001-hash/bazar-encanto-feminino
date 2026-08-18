// =====================================================
// BAZAR ENCANTO FEMININO — VARIAÇÕES & ESTOQUE HELPERS
// =====================================================

export const TAMANHOS_PADRAO = ['PP', 'P', 'M', 'G', 'GG']

export const CORES_PADRAO_SUGESTO = [
  { nome: 'Verde Tropical', hex: '#234B36' },
  { nome: 'Preto', hex: '#1C1C1C' },
  { nome: 'Branco / Off-White', hex: '#F7F3EB' },
  { nome: 'Rosa / Coral', hex: '#E07A5F' },
  { nome: 'Azul Marinho', hex: '#1D3557' },
  { nome: 'Terracota', hex: '#C86D51' },
  { nome: 'Dourado / Areia', hex: '#C9A35A' },
  { nome: 'Vinho / Bordô', hex: '#5E1925' },
  { nome: 'Lavanda', hex: '#9B89B3' },
  { nome: 'Amarelo Mostarda', hex: '#D4A373' }
]

/**
 * Normaliza uma variação de cor
 */
export function normalizarVariacao(variacao, index = 0, produtoId = 0) {
  if (!variacao) return null

  const corNome = (variacao.cor_nome || variacao.nome || variacao.cor || 'Única').trim()
  const corHex = (variacao.cor_hex || variacao.hex || '#234B36').trim()
  
  // Fotos da variação
  let fotos = []
  if (Array.isArray(variacao.fotos)) {
    fotos = variacao.fotos.map((f, fIdx) => {
      if (typeof f === 'string') {
        return { id: `foto-${index}-${fIdx}`, foto: f, ordem: fIdx }
      }
      return {
        id: f.id || `foto-${index}-${fIdx}`,
        foto: f.foto || f.url || '',
        ordem: Number(f.ordem ?? fIdx)
      }
    }).filter((f) => Boolean(f.foto))
  } else if (variacao.foto) {
    fotos = [{ id: `foto-${index}-0`, foto: variacao.foto, ordem: 0 }]
  }

  // Grade de tamanhos da variação
  let tamanhos = []
  if (Array.isArray(variacao.tamanhos)) {
    tamanhos = variacao.tamanhos.map((t) => ({
      id: t.id,
      variacao_id: variacao.id,
      tamanho: String(t.tamanho || '').trim().toUpperCase(),
      quantidade: Math.max(0, Number(t.quantidade || 0))
    }))
  } else if (typeof variacao.tamanhos === 'object' && variacao.tamanhos !== null) {
    tamanhos = Object.entries(variacao.tamanhos).map(([tam, qtd]) => ({
      tamanho: String(tam).trim().toUpperCase(),
      quantidade: Math.max(0, Number(qtd || 0))
    }))
  }

  // Quantidade total desta variação
  const somaTamanhos = tamanhos.reduce((acc, t) => acc + (Number(t.quantidade) || 0), 0)
  const quantidadeTotal = somaTamanhos > 0 ? somaTamanhos : Math.max(0, Number(variacao.quantidade || 0))

  return {
    id: variacao.id || `var-${produtoId}-${index}`,
    produto_id: Number(produtoId || variacao.produto_id || 0),
    cor_nome: corNome,
    cor_hex: corHex,
    fotos,
    foto: fotos[0]?.foto || null,
    tamanhos,
    quantidade: quantidadeTotal,
    ativo: variacao.ativo !== false,
    ordem: Number(variacao.ordem ?? index)
  }
}

/**
 * Normaliza lista de variações de um produto
 * Respeita o array explícito de variações (mesmo que vazio).
 * Fallback SOMENTE para produto legado que não possui campo variacoes definido.
 */
export function normalizarVariacoesProduto(produto) {
  if (!produto) return []

  // Se produto já possui array explícito de variações, respeita exatamente (não recria)
  if (Array.isArray(produto.variacoes)) {
    return produto.variacoes
      .map((v, idx) => normalizarVariacao(v, idx, produto.id))
      .filter(Boolean)
  }

  // Fallback SOMENTE para produto legado que NÃO tem campo variacoes
  // e possui tamanhos ou fotos legados cadastrados
  const temTamanhosLegados = Array.isArray(produto.tamanhos) && produto.tamanhos.length > 0
  const temFotosLegadas = (Array.isArray(produto.fotos) && produto.fotos.length > 0) || Boolean(produto.foto)

  if (temTamanhosLegados || temFotosLegadas) {
    const fotosLegadas = Array.isArray(produto.fotos)
      ? produto.fotos
      : produto.foto
        ? [{ foto: produto.foto, ordem: 0 }]
        : []

    const tamanhosLegados = Array.isArray(produto.tamanhos)
      ? produto.tamanhos
      : []

    const variacaoLegada = normalizarVariacao(
      {
        id: `var-${produto.id}-0`,
        produto_id: produto.id,
        cor_nome: produto.cor || 'Única',
        cor_hex: '#234B36',
        fotos: fotosLegadas,
        tamanhos: tamanhosLegados,
        quantidade: Math.max(0, Number(produto.quantidade || 0)),
        ativo: produto.ativo !== false,
        ordem: 0
      },
      0,
      produto.id
    )

    return [variacaoLegada]
  }

  return []
}

/**
 * Obtém a paleta de cores reais cadastradas de um produto
 */
export function obterPaletaCoresProduto(produto) {
  const variacoes = normalizarVariacoesProduto(produto)
  return variacoes
    .filter((v) => v.ativo !== false)
    .map((v) => ({
      id: v.id,
      nome: v.cor_nome,
      hex: v.cor_hex,
      fotoPrincipal: v.foto || (v.fotos && v.fotos[0]?.foto) || produto.foto || null,
      quantidadeTotal: v.quantidade
    }))
}

/**
 * Obtém as fotos específicas de uma cor selecionada
 */
export function obterFotosDaCor(produto, corOuVariacaoId) {
  const variacoes = normalizarVariacoesProduto(produto)
  if (variacoes.length === 0) {
    return produto.foto ? [produto.foto] : []
  }

  let variacaoEncontrada = null
  if (corOuVariacaoId) {
    variacaoEncontrada = variacoes.find(
      (v) => String(v.id) === String(corOuVariacaoId) || v.cor_nome.toLowerCase() === String(corOuVariacaoId).toLowerCase()
    )
  }

  if (!variacaoEncontrada) {
    variacaoEncontrada = variacoes[0]
  }

  const fotos = (variacaoEncontrada.fotos || []).map((f) => (typeof f === 'string' ? f : f.foto)).filter(Boolean)
  if (fotos.length > 0) return fotos
  if (variacaoEncontrada.foto) return [variacaoEncontrada.foto]
  if (produto.foto) return [produto.foto]
  return []
}

/**
 * Obtém a grade de tamanhos e estoque de uma cor selecionada
 */
export function obterGradeTamanhosDaCor(produto, corOuVariacaoId) {
  const variacoes = normalizarVariacoesProduto(produto)
  if (variacoes.length === 0) {
    return TAMANHOS_PADRAO.map((tam) => ({ tamanho: tam, quantidade: 0, disponivel: false }))
  }

  let variacaoEncontrada = null
  if (corOuVariacaoId) {
    variacaoEncontrada = variacoes.find(
      (v) => String(v.id) === String(corOuVariacaoId) || v.cor_nome.toLowerCase() === String(corOuVariacaoId).toLowerCase()
    )
  }

  if (!variacaoEncontrada) {
    variacaoEncontrada = variacoes[0]
  }

  const mapa = {}
  for (const item of (variacaoEncontrada.tamanhos || [])) {
    mapa[String(item.tamanho).toUpperCase()] = Math.max(0, Number(item.quantidade || 0))
  }

  return TAMANHOS_PADRAO.map((tam) => {
    const qtd = mapa[tam] ?? 0
    return {
      tamanho: tam,
      quantidade: qtd,
      disponivel: qtd > 0
    }
  })
}

/**
 * Gera a chave única de um item de carrinho considerando variação/cor e tamanho
 */
export function gerarChaveCarrinho(produtoId, corNome, tamanho) {
  const idNorm = String(produtoId || 0)
  const corNorm = String(corNome || 'Única').trim().toLowerCase()
  const tamNorm = String(tamanho || '').trim().toUpperCase()
  return `${idNorm}__${corNorm}__${tamNorm}`
}

/**
 * Formata moeda BRL
 */
export function formatarPreco(valor) {
  const num = Number(valor) || 0
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}
