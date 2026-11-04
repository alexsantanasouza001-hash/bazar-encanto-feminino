import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarProduto,
  extrairGradeProduto,
  obterConsignadoTotalProduto,
  obterDistribuicaoEstoqueProduto,
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

test('1. Produto sem consignado: Loja 5, Consignado 0, Total 5', () => {
  const produto = {
    id: 501,
    nome: 'Vestido Primavera',
    sku: 'VES-501',
    tamanhos: [
      { tamanho: 'P', quantidade: 2 },
      { tamanho: 'M', quantidade: 3 }
    ]
  }

  const dist = obterDistribuicaoEstoqueProduto(produto, [])

  assert.equal(dist.totalLoja, 5)
  assert.equal(dist.totalConsignado, 0)
  assert.equal(dist.totalEmpresa, 5)
  assert.equal(dist.revendedoras.length, 0)
})

test('2. Produto com 2 revendedoras: Loja 3, Maria 2, Juliana 1, Total Empresa 6', () => {
  const produto = {
    id: 502,
    nome: 'Vestido Estampado',
    sku: 'VES-502',
    tamanhos: [
      { tamanho: 'P', quantidade: 1 },
      { tamanho: 'M', quantidade: 2 }
    ]
  }

  const remessas = [
    {
      id: 1,
      revendedora_id: 10,
      revendedora_nome: 'Maria',
      itens: [
        {
          id: 11,
          produto_id: 502,
          tamanho: 'P',
          quantidade_enviada: 1,
          quantidade_vendida: 0,
          quantidade_devolvida: 0
        },
        {
          id: 12,
          produto_id: 502,
          tamanho: 'M',
          quantidade_enviada: 1,
          quantidade_vendida: 0,
          quantidade_devolvida: 0
        }
      ]
    },
    {
      id: 2,
      revendedora_id: 20,
      revendedora_nome: 'Juliana',
      itens: [
        {
          id: 21,
          produto_id: 502,
          tamanho: 'G',
          quantidade_enviada: 1,
          quantidade_vendida: 0,
          quantidade_devolvida: 0
        }
      ]
    }
  ]

  const dist = obterDistribuicaoEstoqueProduto(produto, remessas)

  assert.equal(dist.totalLoja, 3)
  assert.equal(dist.totalConsignado, 3) // Maria (2) + Juliana (1) = 3
  assert.equal(dist.totalEmpresa, 6)

  assert.equal(dist.revendedoras.length, 2)
  const maria = dist.revendedoras.find((r) => r.revendedoraNome === 'Maria')
  const juliana = dist.revendedoras.find((r) => r.revendedoraNome === 'Juliana')

  assert.equal(maria.totalRevendedora, 2)
  assert.equal(juliana.totalRevendedora, 1)
})

test('3. Venda reduz saldo da revendedora', () => {
  const produto = {
    id: 503,
    nome: 'Blusa Crepe',
    sku: 'BLU-503',
    tamanhos: [{ tamanho: 'M', quantidade: 2 }]
  }

  const remessas = [
    {
      id: 1,
      revendedora_id: 10,
      revendedora_nome: 'Maria',
      itens: [
        {
          id: 11,
          produto_id: 503,
          tamanho: 'M',
          quantidade_enviada: 3,
          quantidade_vendida: 1, // 1 vendida
          quantidade_devolvida: 0
        }
      ]
    }
  ]

  const dist = obterDistribuicaoEstoqueProduto(produto, remessas)

  assert.equal(dist.totalLoja, 2)
  assert.equal(dist.totalConsignado, 2) // 3 - 1 = 2
  assert.equal(dist.totalEmpresa, 4)

  const maria = dist.revendedoras.find((r) => r.revendedoraNome === 'Maria')
  assert.equal(maria.totalRevendedora, 2)
})

test('4. Devolução reduz saldo da revendedora e retorna à loja conforme fluxo atual', () => {
  const produto = {
    id: 504,
    nome: 'Calça Jeans',
    sku: 'CAL-504',
    tamanhos: [{ tamanho: '38', quantidade: 3 }] // 2 iniciais + 1 devolvida = 3 na loja
  }

  const remessas = [
    {
      id: 1,
      revendedora_id: 10,
      revendedora_nome: 'Maria',
      itens: [
        {
          id: 11,
          produto_id: 504,
          tamanho: '38',
          quantidade_enviada: 2,
          quantidade_vendida: 0,
          quantidade_devolvida: 1 // 1 devolvida
        }
      ]
    }
  ]

  const dist = obterDistribuicaoEstoqueProduto(produto, remessas)

  assert.equal(dist.totalLoja, 3)
  assert.equal(dist.totalConsignado, 1) // 2 - 1 = 1 restante com Maria
  assert.equal(dist.totalEmpresa, 4)

  const maria = dist.revendedoras.find((r) => r.revendedoraNome === 'Maria')
  assert.equal(maria.totalRevendedora, 1)
})

test('5. Preto/M e Rosa/M não são misturados', () => {
  const produto = {
    id: 505,
    nome: 'Vestido Canelado',
    sku: 'VES-505',
    variacoes: [
      {
        id: 1001,
        cor_nome: 'Preto',
        cor_hex: '#000000',
        tamanhos: [
          { tamanho: 'M', quantidade: 2 },
          { tamanho: 'G', quantidade: 1 }
        ]
      },
      {
        id: 1002,
        cor_nome: 'Rosa',
        cor_hex: '#FFC0CB',
        tamanhos: [
          { tamanho: 'P', quantidade: 2 },
          { tamanho: 'M', quantidade: 1 }
        ]
      }
    ]
  }

  const remessas = [
    {
      id: 1,
      revendedora_id: 10,
      revendedora_nome: 'Maria',
      itens: [
        {
          id: 11,
          produto_id: 505,
          variacao_id: 1001,
          cor: 'Preto',
          tamanho: 'M',
          quantidade_enviada: 1,
          quantidade_vendida: 0,
          quantidade_devolvida: 0
        }
      ]
    },
    {
      id: 2,
      revendedora_id: 20,
      revendedora_nome: 'Juliana',
      itens: [
        {
          id: 21,
          produto_id: 505,
          variacao_id: 1002,
          cor: 'Rosa',
          tamanho: 'P',
          quantidade_enviada: 1,
          quantidade_vendida: 0,
          quantidade_devolvida: 0
        }
      ]
    }
  ]

  const dist = obterDistribuicaoEstoqueProduto(produto, remessas)

  // Validação da Loja:
  assert.equal(dist.lojaPorCor.length, 2)
  const corPretoLoja = dist.lojaPorCor.find((c) => c.cor === 'Preto')
  const corRosaLoja = dist.lojaPorCor.find((c) => c.cor === 'Rosa')

  assert.equal(corPretoLoja.totalCor, 3) // M: 2, G: 1
  assert.equal(corRosaLoja.totalCor, 3) // P: 2, M: 1
  assert.equal(dist.totalLoja, 6)

  // Validação do Consignado:
  assert.equal(dist.totalConsignado, 2)
  assert.equal(dist.totalEmpresa, 8)

  const maria = dist.revendedoras.find((r) => r.revendedoraNome === 'Maria')
  const juliana = dist.revendedoras.find((r) => r.revendedoraNome === 'Juliana')

  // Maria tem 1 Preto M (e nenhuma peça Rosa)
  assert.equal(maria.totalRevendedora, 1)
  assert.equal(maria.cores.length, 1)
  assert.equal(maria.cores[0].cor, 'Preto')
  assert.equal(maria.cores[0].tamanhos.find((t) => t.tamanho === 'M').quantidade, 1)

  // Juliana tem 1 Rosa P (e nenhuma peça Preto)
  assert.equal(juliana.totalRevendedora, 1)
  assert.equal(juliana.cores.length, 1)
  assert.equal(juliana.cores[0].cor, 'Rosa')
  assert.equal(juliana.cores[0].tamanhos.find((t) => t.tamanho === 'P').quantidade, 1)
})

test('6. Revendedora com saldo zero não aparece', () => {
  const produto = {
    id: 506,
    nome: 'Short Linho',
    sku: 'SHO-506',
    tamanhos: [{ tamanho: 'M', quantidade: 5 }]
  }

  const remessas = [
    {
      id: 1,
      revendedora_id: 10,
      revendedora_nome: 'Carla',
      itens: [
        {
          id: 11,
          produto_id: 506,
          tamanho: 'M',
          quantidade_enviada: 2,
          quantidade_vendida: 2, // Totalmente vendida (saldo = 0)
          quantidade_devolvida: 0
        }
      ]
    },
    {
      id: 2,
      revendedora_id: 20,
      revendedora_nome: 'Juliana',
      itens: [
        {
          id: 21,
          produto_id: 506,
          tamanho: 'M',
          quantidade_enviada: 1,
          quantidade_vendida: 0,
          quantidade_devolvida: 0 // Saldo = 1
        }
      ]
    }
  ]

  const dist = obterDistribuicaoEstoqueProduto(produto, remessas)

  assert.equal(dist.totalConsignado, 1)
  assert.equal(dist.revendedoras.length, 1)
  assert.equal(dist.revendedoras[0].revendedoraNome, 'Juliana')

  // Carla possui saldo 0 e deve estar completamente oculta
  const carla = dist.revendedoras.find((r) => r.revendedoraNome === 'Carla')
  assert.equal(carla, undefined)
})

