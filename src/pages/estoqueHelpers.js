import { calcularSaldoConsignadoItem } from './revendasHelpers.js'

export const TAMANHOS_GRADE_PADRAO = ['PP', 'P', 'M', 'G', 'GG']

export function normalizarProduto(produto) {
  if (!produto || typeof produto !== 'object') return null

  const fotos = Array.isArray(produto.fotos)
    ? produto.fotos
    : produto.foto
      ? [{ foto: produto.foto, ordem: 0 }]
      : []

  const fotoPrincipal =
    produto.foto ||
    (fotos.length > 0 ? fotos[0].foto : null) ||
    produto.imagem ||
    produto.image ||
    null

  const tamanhos = Array.isArray(produto.tamanhos) ? produto.tamanhos : []

  // Quantidade DERIVADA da soma de todos os tamanhos de TODAS as variações
  const quantidadeDaGrade = tamanhos.reduce(
    (acc, t) => acc + Number(t.quantidade || 0), 0
  )

  return {
    ...produto,
    id: produto.id ?? produto.produto_id ?? Date.now(),
    nome: produto.nome ?? produto.name ?? '',
    marca: produto.marca ?? '',
    categoria: produto.categoria ?? '',
    tamanho: produto.tamanho ?? '',
    cor: produto.cor ?? '',
    sku: produto.sku ?? '',
    quantidade: tamanhos.length > 0 ? quantidadeDaGrade : Number(produto.quantidade ?? produto.estoque ?? 0),
    custo: Number(produto.custo ?? 0),
    venda: Number(produto.venda ?? produto.preco ?? produto.preco_venda ?? 0),
    ativo: produto.ativo !== false,
    foto: fotoPrincipal,
    fotos,
    tamanhos
  }
}

export function obterConsignadoTotalProduto(produtoId, remessas = []) {
  let total = 0
  const idNum = Number(produtoId)
  for (const remessa of remessas) {
    for (const item of (remessa.itens || [])) {
      if (Number(item.produto_id) === idNum) {
        total += calcularSaldoConsignadoItem(item)
      }
    }
  }
  return total
}

export function extrairGradeProduto(produto, remessas = []) {
  const mapa = new Map()

  TAMANHOS_GRADE_PADRAO.forEach((tam) => {
    mapa.set(tam, { tamanho: tam, qtdLoja: 0, qtdConsig: 0 })
  })

  if (Array.isArray(produto?.tamanhos) && produto.tamanhos.length > 0) {
    for (const t of produto.tamanhos) {
      const tamNome = String(t.tamanho || '').trim().toUpperCase()
      if (!tamNome) continue
      const item = mapa.get(tamNome) || { tamanho: tamNome, qtdLoja: 0, qtdConsig: 0 }
      item.qtdLoja = Number(t.quantidade || 0)
      mapa.set(tamNome, item)
    }
  } else if (produto?.tamanho) {
    const partes = String(produto.tamanho).split(',').map((s) => s.trim().toUpperCase())
    if (partes.length === 1 && partes[0]) {
      const tamNome = partes[0]
      const item = mapa.get(tamNome) || { tamanho: tamNome, qtdLoja: 0, qtdConsig: 0 }
      item.qtdLoja = Number(produto.quantidade || 0)
      mapa.set(tamNome, item)
    }
  }

  const prodIdNum = Number(produto?.id)
  for (const remessa of remessas) {
    for (const item of (remessa.itens || [])) {
      if (Number(item.produto_id) === prodIdNum) {
        const tamItem = String(item.tamanho || '').trim().toUpperCase()
        const saldo = calcularSaldoConsignadoItem(item)
        if (tamItem && saldo > 0) {
          const gradeItem = mapa.get(tamItem) || { tamanho: tamItem, qtdLoja: 0, qtdConsig: 0 }
          gradeItem.qtdConsig += saldo
          mapa.set(tamItem, gradeItem)
        }
      }
    }
  }

  const lista = Array.from(mapa.values())

  return lista.sort((a, b) => {
    const idxA = TAMANHOS_GRADE_PADRAO.indexOf(a.tamanho)
    const idxB = TAMANHOS_GRADE_PADRAO.indexOf(b.tamanho)
    if (idxA !== -1 && idxB !== -1) return idxA - idxB
    if (idxA !== -1) return -1
    if (idxB !== -1) return 1
    return a.tamanho.localeCompare(b.tamanho)
  })
}

export function agruparConsignacaoPorRevendedora(produtoId, remessas = []) {
  const mapaRevendedoras = new Map()
  const prodIdNum = Number(produtoId)

  for (const remessa of remessas) {
    for (const item of (remessa.itens || [])) {
      if (Number(item.produto_id) === prodIdNum) {
        const saldo = calcularSaldoConsignadoItem(item)
        if (saldo > 0) {
          const revId = remessa.revendedora_id || remessa.revendedora_nome || 'parceira-geral'
          const dadosRev = mapaRevendedoras.get(revId) || {
            revendedora_id: remessa.revendedora_id,
            revendedora_nome: remessa.revendedora_nome || 'Revendedora Parceira',
            revendedora_telefone: remessa.revendedora_telefone || '',
            totalConsignado: 0,
            grade: { PP: 0, P: 0, M: 0, G: 0, GG: 0 }
          }

          const tam = String(item.tamanho || '').trim().toUpperCase()
          dadosRev.totalConsignado += saldo
          if (dadosRev.grade[tam] !== undefined) {
            dadosRev.grade[tam] += saldo
          } else {
            dadosRev.grade[tam] = saldo
          }

          mapaRevendedoras.set(revId, dadosRev)
        }
      }
    }
  }

  return Array.from(mapaRevendedoras.values())
}

export function filtrarEOrdenarProdutos(produtos = [], remessas = [], filtros = {}) {
  const {
    busca = '',
    visibilidadeFiltro = 'Ativos',
    categoriaFiltro = 'Todas as categorias',
    tamanhoFiltro = 'Todos os tamanhos',
    statusFiltro = 'Todos os status',
    ordenacao = 'nome_asc'
  } = filtros

  const filtrados = produtos.filter((produto) => {
    if (visibilidadeFiltro === 'Ativos' && produto.ativo === false) return false
    if (visibilidadeFiltro === 'Arquivados' && produto.ativo !== false) return false

    let qtdLoja = 0
    if (Array.isArray(produto.tamanhos) && produto.tamanhos.length > 0) {
      qtdLoja = produto.tamanhos.reduce((acc, t) => acc + Number(t.quantidade || 0), 0)
    } else {
      qtdLoja = Number(produto.quantidade || 0)
    }

    const qtdConsig = obterConsignadoTotalProduto(produto.id, remessas)

    let status = 'Estoque normal'
    if (qtdLoja === 0) {
      status = 'Sem estoque'
    } else if (qtdLoja <= 2) {
      status = 'Estoque baixo'
    }

    const termo = busca.trim().toLowerCase()
    if (termo) {
      const nome = String(produto.nome || '').toLowerCase()
      const sku = String(produto.sku || '').toLowerCase()
      const categoria = String(produto.categoria || '').toLowerCase()
      if (!nome.includes(termo) && !sku.includes(termo) && !categoria.includes(termo)) {
        return false
      }
    }

    if (categoriaFiltro !== 'Todas as categorias') {
      const catProd = String(produto.categoria || '').trim().toLowerCase()
      if (catProd !== categoriaFiltro.trim().toLowerCase()) {
        return false
      }
    }

    if (statusFiltro === 'Estoque normal' && status !== 'Estoque normal') return false
    if (statusFiltro === 'Estoque baixo' && status !== 'Estoque baixo') return false
    if (statusFiltro === 'Sem estoque' && status !== 'Sem estoque') return false
    if (statusFiltro === 'Com consignação' && qtdConsig === 0) return false

    if (tamanhoFiltro !== 'Todos os tamanhos') {
      const tamAlvo = tamanhoFiltro.toUpperCase()
      if (Array.isArray(produto.tamanhos) && produto.tamanhos.length > 0) {
        const match = produto.tamanhos.some(
          (t) => String(t.tamanho || '').trim().toUpperCase() === tamAlvo && Number(t.quantidade || 0) > 0
        )
        if (!match) return false
      } else if (produto.tamanho) {
        const partes = String(produto.tamanho).split(',').map((s) => s.trim().toUpperCase())
        if (!partes.includes(tamAlvo) || Number(produto.quantidade || 0) === 0) {
          return false
        }
      } else {
        return false
      }
    }

    return true
  })

  return filtrados.sort((a, b) => {
    const qtdLojaA = Array.isArray(a.tamanhos) && a.tamanhos.length > 0
      ? a.tamanhos.reduce((acc, t) => acc + Number(t.quantidade || 0), 0)
      : Number(a.quantidade || 0)

    const qtdLojaB = Array.isArray(b.tamanhos) && b.tamanhos.length > 0
      ? b.tamanhos.reduce((acc, t) => acc + Number(t.quantidade || 0), 0)
      : Number(b.quantidade || 0)

    const qtdConsigA = obterConsignadoTotalProduto(a.id, remessas)
    const qtdConsigB = obterConsignadoTotalProduto(b.id, remessas)

    if (ordenacao === 'nome_asc') return String(a.nome || '').localeCompare(String(b.nome || ''))
    if (ordenacao === 'nome_desc') return String(b.nome || '').localeCompare(String(a.nome || ''))
    if (ordenacao === 'estoque_asc') return qtdLojaA - qtdLojaB
    if (ordenacao === 'estoque_desc') return qtdLojaB - qtdLojaA
    if (ordenacao === 'consignado_desc') return qtdConsigB - qtdConsigA
    if (ordenacao === 'preco_desc') return Number(b.venda || 0) - Number(a.venda || 0)
    if (ordenacao === 'preco_asc') return Number(a.venda || 0) - Number(b.venda || 0)
    return 0
  })
}

export function obterDistribuicaoEstoqueProduto(produto, remessas = []) {
  if (!produto) {
    return {
      lojaPorCor: [],
      totalLoja: 0,
      revendedoras: [],
      totalConsignado: 0,
      totalEmpresa: 0
    }
  }

  const prodIdNum = Number(produto.id)

  // 1. ESTOQUE NA LOJA POR COR E TAMANHO
  const lojaPorCor = []
  let totalLoja = 0

  if (Array.isArray(produto.variacoes) && produto.variacoes.length > 0) {
    for (const v of produto.variacoes) {
      const corNome = (v.cor_nome || v.cor || 'Única').trim()
      const corHex = v.cor_hex || '#234B36'
      const variacaoId = v.id

      const tamanhosMap = new Map()
      TAMANHOS_GRADE_PADRAO.forEach((tam) => tamanhosMap.set(tam, 0))

      if (Array.isArray(v.tamanhos)) {
        for (const t of v.tamanhos) {
          const tNome = String(t.tamanho || '').trim().toUpperCase()
          if (tNome) {
            tamanhosMap.set(tNome, Number(t.quantidade || 0))
          }
        }
      }

      if (Array.isArray(produto.tamanhos)) {
        for (const t of produto.tamanhos) {
          if (Number(t.variacao_id) === Number(variacaoId)) {
            const tNome = String(t.tamanho || '').trim().toUpperCase()
            if (tNome) {
              tamanhosMap.set(tNome, Number(t.quantidade || 0))
            }
          }
        }
      }

      const tamanhosLista = Array.from(tamanhosMap.entries()).map(([tam, qtd]) => ({
        tamanho: tam,
        quantidade: qtd
      }))

      tamanhosLista.sort((a, b) => {
        const idxA = TAMANHOS_GRADE_PADRAO.indexOf(a.tamanho)
        const idxB = TAMANHOS_GRADE_PADRAO.indexOf(b.tamanho)
        if (idxA !== -1 && idxB !== -1) return idxA - idxB
        if (idxA !== -1) return -1
        if (idxB !== -1) return 1
        return a.tamanho.localeCompare(b.tamanho)
      })

      const totalCor = tamanhosLista.reduce((acc, t) => acc + t.quantidade, 0)
      totalLoja += totalCor

      lojaPorCor.push({
        variacaoId,
        cor: corNome,
        corHex,
        tamanhos: tamanhosLista,
        totalCor
      })
    }
  } else if (Array.isArray(produto.tamanhos) && produto.tamanhos.length > 0) {
    const coresMap = new Map()

    for (const t of produto.tamanhos) {
      const corNome = (t.cor || produto.cor || 'Única').trim()
      const corHex = t.cor_hex || '#234B36'
      const varId = t.variacao_id || null

      if (!coresMap.has(corNome)) {
        const tMap = new Map()
        TAMANHOS_GRADE_PADRAO.forEach((tam) => tMap.set(tam, 0))
        coresMap.set(corNome, { cor: corNome, corHex, variacaoId: varId, tamanhosMap: tMap })
      }

      const tNome = String(t.tamanho || '').trim().toUpperCase()
      if (tNome) {
        coresMap.get(corNome).tamanhosMap.set(tNome, Number(t.quantidade || 0))
      }
    }

    for (const [, obj] of coresMap) {
      const tamanhosLista = Array.from(obj.tamanhosMap.entries()).map(([tam, qtd]) => ({
        tamanho: tam,
        quantidade: qtd
      }))

      tamanhosLista.sort((a, b) => {
        const idxA = TAMANHOS_GRADE_PADRAO.indexOf(a.tamanho)
        const idxB = TAMANHOS_GRADE_PADRAO.indexOf(b.tamanho)
        if (idxA !== -1 && idxB !== -1) return idxA - idxB
        if (idxA !== -1) return -1
        if (idxB !== -1) return 1
        return a.tamanho.localeCompare(b.tamanho)
      })

      const totalCor = tamanhosLista.reduce((acc, t) => acc + t.quantidade, 0)
      totalLoja += totalCor

      lojaPorCor.push({
        variacaoId: obj.variacaoId,
        cor: obj.cor,
        corHex: obj.corHex,
        tamanhos: tamanhosLista,
        totalCor
      })
    }
  } else {
    const corNome = (produto.cor || 'Única').trim()
    const qtd = Number(produto.quantidade || 0)
    totalLoja = qtd
    lojaPorCor.push({
      variacaoId: null,
      cor: corNome,
      corHex: '#234B36',
      tamanhos: [{ tamanho: produto.tamanho || 'U', quantidade: qtd }],
      totalCor: qtd
    })
  }

  // 2. ESTOQUE POR REVENDEDORA (CONSIGNADO)
  const revendedorasMap = new Map()
  let totalConsignado = 0

  for (const remessa of remessas) {
    for (const item of (remessa.itens || [])) {
      if (Number(item.produto_id) === prodIdNum) {
        const saldo = calcularSaldoConsignadoItem(item)
        if (saldo > 0) {
          const revId = remessa.revendedora_id || remessa.revendedora_nome || 'rev-outra'
          const revNome = remessa.revendedora_nome || 'Revendedora Parceira'

          if (!revendedorasMap.has(revId)) {
            revendedorasMap.set(revId, {
              revendedoraId: revId,
              revendedoraNome: revNome,
              totalRevendedora: 0,
              coresMap: new Map()
            })
          }

          const revData = revendedorasMap.get(revId)
          revData.totalRevendedora += saldo
          totalConsignado += saldo

          const corItem = (item.cor || produto.cor || 'Única').trim()
          const corHexItem = item.cor_hex || '#234B36'
          const varIdItem = item.variacao_id || null

          if (!revData.coresMap.has(corItem)) {
            revData.coresMap.set(corItem, {
              cor: corItem,
              corHex: corHexItem,
              variacaoId: varIdItem,
              tamanhosMap: new Map(),
              totalCor: 0
            })
          }

          const corData = revData.coresMap.get(corItem)
          corData.totalCor += saldo

          const tamItem = String(item.tamanho || 'U').trim().toUpperCase()
          const qtdAtual = corData.tamanhosMap.get(tamItem) || 0
          corData.tamanhosMap.set(tamItem, qtdAtual + saldo)
        }
      }
    }
  }

  const revendedoras = []
  for (const [, rObj] of revendedorasMap) {
    if (rObj.totalRevendedora > 0) {
      const coresLista = []
      for (const [, cObj] of rObj.coresMap) {
        const tamanhosLista = Array.from(cObj.tamanhosMap.entries())
          .filter(([, qtd]) => qtd > 0)
          .map(([tam, qtd]) => ({
            tamanho: tam,
            quantidade: qtd
          }))

        tamanhosLista.sort((a, b) => {
          const idxA = TAMANHOS_GRADE_PADRAO.indexOf(a.tamanho)
          const idxB = TAMANHOS_GRADE_PADRAO.indexOf(b.tamanho)
          if (idxA !== -1 && idxB !== -1) return idxA - idxB
          if (idxA !== -1) return -1
          if (idxB !== -1) return 1
          return a.tamanho.localeCompare(b.tamanho)
        })

        coresLista.push({
          cor: cObj.cor,
          corHex: cObj.corHex,
          variacaoId: cObj.variacaoId,
          tamanhos: tamanhosLista,
          totalCor: cObj.totalCor
        })
      }

      revendedoras.push({
        revendedoraId: rObj.revendedoraId,
        revendedoraNome: rObj.revendedoraNome,
        totalRevendedora: rObj.totalRevendedora,
        cores: coresLista
      })
    }
  }

  const totalEmpresa = totalLoja + totalConsignado

  return {
    produtoId: prodIdNum,
    produtoNome: produto.nome || '',
    sku: produto.sku || '',
    foto: produto.foto || null,
    lojaPorCor,
    totalLoja,
    revendedoras,
    totalConsignado,
    totalEmpresa
  }
}
