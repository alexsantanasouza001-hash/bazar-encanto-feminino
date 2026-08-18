import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarProduto,
  extrairGradeProduto,
  obterConsignadoTotalProduto,
  agruparConsignacaoPorRevendedora,
  filtrarEOrdenarProdutos,
  TAMANHOS_GRADE_PADRAO
} from './estoqueHelpers.js'

test('Produto com foto principal identificada e preservada', () => {
  const p1 = normalizarProduto({
    id: 1,
    nome: 'Vestido Floral',
    foto: 'https://exemplo.com/foto1.jpg',
    quantidade: 5
  })
  assert.equal(p1.foto, 'https://exemplo.com/foto1.jpg')
  assert.equal(p1.nome, 'Vestido Floral')
})

test('Produto sem foto recebe null e mantém fallback gracioso', () => {
  const p2 = normalizarProduto({
    id: 2,
    nome: 'Saia Midi Sem Foto'
  })
  assert.equal(p2.foto, null)
  assert.equal(p2.quantidade, 0)
})

test('Grade PP, P, M, G, GG sempre exibida mesmo para tamanhos com quantidade zero', () => {
  const produto = {
    id: 10,
    nome: 'Vestido Seda',
    tamanhos: [
      { tamanho: 'P', quantidade: 3 },
      { tamanho: 'G', quantidade: 2 }
    ]
  }

  const grade = extrairGradeProduto(produto, [])
  const tamanhosNomes = grade.map((g) => g.tamanho)

  assert.deepEqual(tamanhosNomes.slice(0, 5), TAMANHOS_GRADE_PADRAO)

  const itemPP = grade.find((g) => g.tamanho === 'PP')
  const itemP = grade.find((g) => g.tamanho === 'P')
  const itemM = grade.find((g) => g.tamanho === 'M')
  const itemG = grade.find((g) => g.tamanho === 'G')
  const itemGG = grade.find((g) => g.tamanho === 'GG')

  assert.equal(itemPP.qtdLoja, 0)
  assert.equal(itemP.qtdLoja, 3)
  assert.equal(itemM.qtdLoja, 0)
  assert.equal(itemG.qtdLoja, 2)
  assert.equal(itemGG.qtdLoja, 0)
})

test('Consignação por tamanho integra com remessas reais e separa loja de consignado', () => {
  const produto = {
    id: 20,
    nome: 'Conjunto Alfaiataria',
    tamanhos: [{ tamanho: 'M', quantidade: 4 }]
  }

  const remessas = [
    {
      id: 101,
      revendedora_id: 1,
      revendedora_nome: 'Maria Silva',
      revendedora_telefone: '11999998888',
      itens: [
        {
          id: 1,
          produto_id: 20,
          tamanho: 'M',
          quantidade_enviada: 3,
          quantidade_vendida: 1,
          quantidade_devolvida: 0
        },
        {
          id: 2,
          produto_id: 20,
          tamanho: 'G',
          quantidade_enviada: 2,
          quantidade_vendida: 0,
          quantidade_devolvida: 0
        }
      ]
    },
    {
      id: 102,
      revendedora_id: 2,
      revendedora_nome: 'Ana Souza',
      itens: [
        {
          id: 3,
          produto_id: 20,
          tamanho: 'M',
          quantidade_enviada: 2,
          quantidade_vendida: 0,
          quantidade_devolvida: 1
        }
      ]
    }
  ]

  const totalConsig = obterConsignadoTotalProduto(20, remessas)
  assert.equal(totalConsig, 5) // (3-1) + 2 + (2-1) = 2 + 2 + 1 = 5

  const grade = extrairGradeProduto(produto, remessas)
  const itemM = grade.find((g) => g.tamanho === 'M')
  const itemG = grade.find((g) => g.tamanho === 'G')

  assert.equal(itemM.qtdLoja, 4)
  assert.equal(itemM.qtdConsig, 3) // 2 de Maria + 1 de Ana
  assert.equal(itemG.qtdLoja, 0)
  assert.equal(itemG.qtdConsig, 2) // 2 de Maria

  const porRevendedora = agruparConsignacaoPorRevendedora(20, remessas)
  assert.equal(porRevendedora.length, 2)

  const revMaria = porRevendedora.find((r) => r.revendedora_nome === 'Maria Silva')
  assert.equal(revMaria.totalConsignado, 4) // 2 M + 2 G
  assert.equal(revMaria.grade.M, 2)
  assert.equal(revMaria.grade.G, 2)
  assert.equal(revMaria.grade.PP, 0)

  const revAna = porRevendedora.find((r) => r.revendedora_nome === 'Ana Souza')
  assert.equal(revAna.totalConsignado, 1)
  assert.equal(revAna.grade.M, 1)
})

test('Filtros: busca por nome/SKU/categoria, filtro de tamanho e status', () => {
  const produtos = [
    {
      id: 1,
      nome: 'Vestido Longo Floral',
      sku: 'VES-001',
      categoria: 'Vestidos',
      tamanhos: [{ tamanho: 'P', quantidade: 5 }],
      ativo: true
    },
    {
      id: 2,
      nome: 'Blusa Crepe',
      sku: 'BLU-002',
      categoria: 'Blusas',
      tamanhos: [{ tamanho: 'M', quantidade: 1 }],
      ativo: true
    },
    {
      id: 3,
      nome: 'Calça Linho',
      sku: 'CAL-003',
      categoria: 'Calças',
      tamanhos: [{ tamanho: 'G', quantidade: 0 }],
      ativo: true
    }
  ]

  // Busca
  const buscaVestido = filtrarEOrdenarProdutos(produtos, [], { busca: 'floral' })
  assert.equal(buscaVestido.length, 1)
  assert.equal(buscaVestido[0].id, 1)

  // Filtro por tamanho
  const filtroTamP = filtrarEOrdenarProdutos(produtos, [], { tamanhoFiltro: 'P' })
  assert.equal(filtroTamP.length, 1)
  assert.equal(filtroTamP[0].id, 1)

  // Status baixo estoque (1-2 un)
  const baixoEstoque = filtrarEOrdenarProdutos(produtos, [], { statusFiltro: 'Estoque baixo' })
  assert.equal(baixoEstoque.length, 1)
  assert.equal(baixoEstoque[0].id, 2)

  // Status sem estoque (0 un)
  const semEstoque = filtrarEOrdenarProdutos(produtos, [], { statusFiltro: 'Sem estoque' })
  assert.equal(semEstoque.length, 1)
  assert.equal(semEstoque[0].id, 3)
})

test('Ordenação de estoque: Menor estoque primeiro e Nome A-Z', () => {
  const produtos = [
    { id: 1, nome: 'Zebra Vestido', quantidade: 10 },
    { id: 2, nome: 'Abelha Saia', quantidade: 2 },
    { id: 3, nome: 'Camisa Jeans', quantidade: 0 }
  ]

  const ordEstoqueAsc = filtrarEOrdenarProdutos(produtos, [], { ordenacao: 'estoque_asc' })
  assert.equal(ordEstoqueAsc[0].id, 3) // 0 un
  assert.equal(ordEstoqueAsc[1].id, 2) // 2 un
  assert.equal(ordEstoqueAsc[2].id, 1) // 10 un

  const ordNomeAsc = filtrarEOrdenarProdutos(produtos, [], { ordenacao: 'nome_asc' })
  assert.equal(ordNomeAsc[0].id, 2) // Abelha
  assert.equal(ordNomeAsc[1].id, 3) // Camisa
  assert.equal(ordNomeAsc[2].id, 1) // Zebra
})
