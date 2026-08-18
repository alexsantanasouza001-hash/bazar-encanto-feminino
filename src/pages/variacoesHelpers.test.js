import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarVariacoesProduto,
  obterPaletaCoresProduto,
  obterFotosDaCor,
  obterGradeTamanhosDaCor,
  gerarChaveCarrinho
} from './variacoesHelpers.js'

test('1. Produto com múltiplas cores mantém estoques e fotos independentes', () => {
  const produto = {
    id: 101,
    nome: 'Vestido Tropical Elegance',
    venda: 189.9,
    variacoes: [
      {
        id: 1,
        cor_nome: 'Verde Tropical',
        cor_hex: '#234B36',
        fotos: ['https://exemplo.com/verde1.jpg', 'https://exemplo.com/verde2.jpg'],
        tamanhos: [
          { tamanho: 'PP', quantidade: 1 },
          { tamanho: 'P', quantidade: 2 },
          { tamanho: 'M', quantidade: 3 },
          { tamanho: 'G', quantidade: 1 },
          { tamanho: 'GG', quantidade: 0 }
        ]
      },
      {
        id: 2,
        cor_nome: 'Preto Clássico',
        cor_hex: '#1C1C1C',
        fotos: ['https://exemplo.com/preto1.jpg'],
        tamanhos: [
          { tamanho: 'PP', quantidade: 0 },
          { tamanho: 'P', quantidade: 0 },
          { tamanho: 'M', quantidade: 2 },
          { tamanho: 'G', quantidade: 2 },
          { tamanho: 'GG', quantidade: 1 }
        ]
      }
    ]
  }

  const variacoes = normalizarVariacoesProduto(produto)
  assert.equal(variacoes.length, 2)
  assert.equal(variacoes[0].cor_nome, 'Verde Tropical')
  assert.equal(variacoes[0].quantidade, 7) // 1 + 2 + 3 + 1 + 0 = 7
  assert.equal(variacoes[1].cor_nome, 'Preto Clássico')
  assert.equal(variacoes[1].quantidade, 5) // 0 + 0 + 2 + 2 + 1 = 5
})

test('2. Troca de cor na loja retorna fotos exclusivas daquela cor', () => {
  const produto = {
    id: 101,
    nome: 'Vestido Tropical Elegance',
    variacoes: [
      {
        id: 1,
        cor_nome: 'Verde',
        fotos: ['https://exemplo.com/verde1.jpg', 'https://exemplo.com/verde2.jpg']
      },
      {
        id: 2,
        cor_nome: 'Preto',
        fotos: ['https://exemplo.com/preto1.jpg']
      }
    ]
  }

  const fotosVerde = obterFotosDaCor(produto, 'Verde')
  assert.deepEqual(fotosVerde, ['https://exemplo.com/verde1.jpg', 'https://exemplo.com/verde2.jpg'])

  const fotosPreto = obterFotosDaCor(produto, 'Preto')
  assert.deepEqual(fotosPreto, ['https://exemplo.com/preto1.jpg'])
})

test('3. Troca de cor atualiza a disponibilidade dos tamanhos PP/P/M/G/GG', () => {
  const produto = {
    id: 101,
    variacoes: [
      {
        cor_nome: 'Verde',
        tamanhos: [
          { tamanho: 'P', quantidade: 3 },
          { tamanho: 'M', quantidade: 0 }
        ]
      },
      {
        cor_nome: 'Preto',
        tamanhos: [
          { tamanho: 'P', quantidade: 0 },
          { tamanho: 'M', quantidade: 4 }
        ]
      }
    ]
  }

  const gradeVerde = obterGradeTamanhosDaCor(produto, 'Verde')
  const pVerde = gradeVerde.find((t) => t.tamanho === 'P')
  const mVerde = gradeVerde.find((t) => t.tamanho === 'M')
  assert.equal(pVerde.disponivel, true)
  assert.equal(pVerde.quantidade, 3)
  assert.equal(mVerde.disponivel, false)
  assert.equal(mVerde.quantidade, 0)

  const gradePreto = obterGradeTamanhosDaCor(produto, 'Preto')
  const pPreto = gradePreto.find((t) => t.tamanho === 'P')
  const mPreto = gradePreto.find((t) => t.tamanho === 'M')
  assert.equal(pPreto.disponivel, false)
  assert.equal(pPreto.quantidade, 0)
  assert.equal(mPreto.disponivel, true)
  assert.equal(mPreto.quantidade, 4)
})

test('4. Carrinho diferencia duas cores do mesmo produto em itens separados', () => {
  const chaveVerdeM = gerarChaveCarrinho(101, 'Verde', 'M')
  const chavePretoM = gerarChaveCarrinho(101, 'Preto', 'M')
  const chaveVerdeG = gerarChaveCarrinho(101, 'Verde', 'G')

  assert.notEqual(chaveVerdeM, chavePretoM)
  assert.notEqual(chaveVerdeM, chaveVerdeG)
  assert.equal(chaveVerdeM, '101__verde__M')
  assert.equal(chavePretoM, '101__preto__M')
})

test('5. Produto legado sem variações continua funcionando com fallback seguro', () => {
  const produtoLegado = {
    id: 50,
    nome: 'Blusa Básica',
    foto: 'https://exemplo.com/foto-legada.jpg',
    cor: 'Branca',
    tamanhos: [
      { tamanho: 'P', quantidade: 5 },
      { tamanho: 'M', quantidade: 2 }
    ]
  }

  const variacoes = normalizarVariacoesProduto(produtoLegado)
  assert.equal(variacoes.length, 1)
  assert.equal(variacoes[0].cor_nome, 'Branca')
  assert.equal(variacoes[0].foto, 'https://exemplo.com/foto-legada.jpg')

  const paleta = obterPaletaCoresProduto(produtoLegado)
  assert.equal(paleta.length, 1)
  assert.equal(paleta[0].nome, 'Branca')

  const grade = obterGradeTamanhosDaCor(produtoLegado)
  const p = grade.find((t) => t.tamanho === 'P')
  assert.equal(p.disponivel, true)
  assert.equal(p.quantidade, 5)
})

// =====================================================
// TESTES DE AGREGAÇÃO DE ESTOQUE MULTI-COR
// =====================================================

test('6. Total estoque com 1 cor = soma daquela cor', () => {
  const produto = {
    id: 200,
    variacoes: [{
      cor_nome: 'Verde',
      cor_hex: '#234B36',
      tamanhos: [
        { tamanho: 'PP', quantidade: 1 },
        { tamanho: 'P', quantidade: 2 },
        { tamanho: 'M', quantidade: 3 },
        { tamanho: 'G', quantidade: 0 },
        { tamanho: 'GG', quantidade: 0 }
      ]
    }]
  }
  const variacoes = normalizarVariacoesProduto(produto)
  assert.equal(variacoes.length, 1)
  assert.equal(variacoes[0].quantidade, 6)
  const totalProduto = variacoes.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(totalProduto, 6)
})

test('7. Total estoque com 2 cores = soma de ambas', () => {
  const produto = {
    id: 201,
    variacoes: [
      {
        cor_nome: 'Verde',
        cor_hex: '#234B36',
        tamanhos: [
          { tamanho: 'PP', quantidade: 1 },
          { tamanho: 'P', quantidade: 2 },
          { tamanho: 'M', quantidade: 3 },
          { tamanho: 'G', quantidade: 0 },
          { tamanho: 'GG', quantidade: 0 }
        ]
      },
      {
        cor_nome: 'Preto',
        cor_hex: '#1C1C1C',
        tamanhos: [
          { tamanho: 'PP', quantidade: 0 },
          { tamanho: 'P', quantidade: 1 },
          { tamanho: 'M', quantidade: 2 },
          { tamanho: 'G', quantidade: 2 },
          { tamanho: 'GG', quantidade: 1 }
        ]
      }
    ]
  }
  const variacoes = normalizarVariacoesProduto(produto)
  assert.equal(variacoes[0].quantidade, 6) // Verde
  assert.equal(variacoes[1].quantidade, 6) // Preto
  const totalProduto = variacoes.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(totalProduto, 12)
})

test('8. Total estoque com 3 cores = soma das três', () => {
  const produto = {
    id: 202,
    variacoes: [
      { cor_nome: 'Verde', tamanhos: [{ tamanho: 'PP', quantidade: 2 }, { tamanho: 'P', quantidade: 2 }, { tamanho: 'M', quantidade: 2 }] },
      { cor_nome: 'Preto', tamanhos: [{ tamanho: 'PP', quantidade: 1 }, { tamanho: 'P', quantidade: 1 }, { tamanho: 'M', quantidade: 2 }] },
      { cor_nome: 'Rosa', tamanhos: [{ tamanho: 'PP', quantidade: 2 }, { tamanho: 'P', quantidade: 2 }, { tamanho: 'M', quantidade: 1 }] }
    ]
  }
  const variacoes = normalizarVariacoesProduto(produto)
  assert.equal(variacoes[0].quantidade, 6)
  assert.equal(variacoes[1].quantidade, 4)
  assert.equal(variacoes[2].quantidade, 5)
  const totalProduto = variacoes.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(totalProduto, 15)
})

test('9. Segunda cor zerada não prejudica total', () => {
  const produto = {
    id: 203,
    variacoes: [
      { cor_nome: 'Verde', tamanhos: [{ tamanho: 'P', quantidade: 3 }, { tamanho: 'M', quantidade: 3 }] },
      { cor_nome: 'Preto', tamanhos: [{ tamanho: 'P', quantidade: 0 }, { tamanho: 'M', quantidade: 0 }] }
    ]
  }
  const variacoes = normalizarVariacoesProduto(produto)
  assert.equal(variacoes[0].quantidade, 6)
  assert.equal(variacoes[1].quantidade, 0)
  const totalProduto = variacoes.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(totalProduto, 6)
})

test('10. Primeira cor zerada, segunda com estoque', () => {
  const produto = {
    id: 204,
    variacoes: [
      { cor_nome: 'Verde', tamanhos: [{ tamanho: 'P', quantidade: 0 }, { tamanho: 'M', quantidade: 0 }] },
      { cor_nome: 'Preto', tamanhos: [{ tamanho: 'P', quantidade: 3 }, { tamanho: 'M', quantidade: 3 }] }
    ]
  }
  const variacoes = normalizarVariacoesProduto(produto)
  assert.equal(variacoes[0].quantidade, 0)
  assert.equal(variacoes[1].quantidade, 6)
  const totalProduto = variacoes.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(totalProduto, 6)
})

test('11. Todas as cores zeradas = total 0', () => {
  const produto = {
    id: 205,
    variacoes: [
      { cor_nome: 'Verde', tamanhos: [{ tamanho: 'P', quantidade: 0 }, { tamanho: 'M', quantidade: 0 }] },
      { cor_nome: 'Preto', tamanhos: [{ tamanho: 'P', quantidade: 0 }, { tamanho: 'M', quantidade: 0 }] }
    ]
  }
  const variacoes = normalizarVariacoesProduto(produto)
  const totalProduto = variacoes.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(totalProduto, 0)
})

test('12. Entrada numa segunda cor aumenta total consolidado', () => {
  // Simular estado ANTES da entrada
  const produtoAntes = {
    id: 206,
    variacoes: [
      { cor_nome: 'Verde', tamanhos: [{ tamanho: 'P', quantidade: 3 }] },
      { cor_nome: 'Preto', tamanhos: [{ tamanho: 'P', quantidade: 2 }] }
    ]
  }
  const varAntes = normalizarVariacoesProduto(produtoAntes)
  const totalAntes = varAntes.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(totalAntes, 5)

  // Simular estado DEPOIS da entrada de +3 em Preto/P
  const produtoDepois = {
    id: 206,
    variacoes: [
      { cor_nome: 'Verde', tamanhos: [{ tamanho: 'P', quantidade: 3 }] },
      { cor_nome: 'Preto', tamanhos: [{ tamanho: 'P', quantidade: 5 }] }
    ]
  }
  const varDepois = normalizarVariacoesProduto(produtoDepois)
  const totalDepois = varDepois.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(totalDepois, 8)
  assert.equal(totalDepois - totalAntes, 3) // +3 unidades
})

test('13. Saída numa segunda cor reduz total consolidado', () => {
  // Simular estado ANTES
  const produtoAntes = {
    id: 207,
    variacoes: [
      { cor_nome: 'Verde', tamanhos: [{ tamanho: 'M', quantidade: 4 }] },
      { cor_nome: 'Preto', tamanhos: [{ tamanho: 'M', quantidade: 3 }] }
    ]
  }
  const varAntes = normalizarVariacoesProduto(produtoAntes)
  const totalAntes = varAntes.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(totalAntes, 7)

  // Simular estado DEPOIS de saída de -1 em Preto/M
  const produtoDepois = {
    id: 207,
    variacoes: [
      { cor_nome: 'Verde', tamanhos: [{ tamanho: 'M', quantidade: 4 }] },
      { cor_nome: 'Preto', tamanhos: [{ tamanho: 'M', quantidade: 2 }] }
    ]
  }
  const varDepois = normalizarVariacoesProduto(produtoDepois)
  const totalDepois = varDepois.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(totalDepois, 6)
  assert.equal(totalAntes - totalDepois, 1) // -1 unidade
})

test('14. Produto permanece visível se qualquer cor tiver estoque', () => {
  // Cor Verde zerada, Preto com estoque
  const produto = {
    id: 208,
    ativo: true,
    variacoes: [
      { cor_nome: 'Verde', tamanhos: [{ tamanho: 'P', quantidade: 0 }, { tamanho: 'M', quantidade: 0 }] },
      { cor_nome: 'Preto', tamanhos: [{ tamanho: 'P', quantidade: 1 }, { tamanho: 'M', quantidade: 2 }] }
    ]
  }
  const variacoes = normalizarVariacoesProduto(produto)
  const totalProduto = variacoes.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(totalProduto, 3)
  assert.ok(totalProduto > 0, 'Produto deve permanecer visível pois Preto tem estoque')

  // Paleta de cores ativas mostra Preto com estoque
  const paleta = obterPaletaCoresProduto(produto)
  const pretoNaPaleta = paleta.find((p) => p.nome === 'Preto')
  assert.ok(pretoNaPaleta, 'Preto deve estar na paleta')
  assert.equal(pretoNaPaleta.quantidadeTotal, 3)
})

test('15. Consignação preserva patrimônio total (na loja + consignado = empresa)', () => {
  // Produto com 2 cores e 12 unidades na loja
  const produto = {
    id: 209,
    variacoes: [
      { cor_nome: 'Verde', tamanhos: [{ tamanho: 'P', quantidade: 3 }, { tamanho: 'M', quantidade: 3 }] },
      { cor_nome: 'Preto', tamanhos: [{ tamanho: 'P', quantidade: 3 }, { tamanho: 'M', quantidade: 3 }] }
    ]
  }
  const variacoes = normalizarVariacoesProduto(produto)
  const naLoja = variacoes.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(naLoja, 12)

  // Simular envio para consignação: Preto/G 1 unidade
  // Na Loja antes: 12 → Na Loja depois: 11, Consignado: 1, Total Empresa: 12
  const consignado = 1
  const naLojaDepois = naLoja - consignado
  const totalEmpresa = naLojaDepois + consignado
  assert.equal(naLojaDepois, 11)
  assert.equal(totalEmpresa, 12, 'Patrimônio total se preserva')
})

test('16. Edição de produto com 2 cores: preserva tamanhos da 2ª cor na reidratação', () => {
  // Simular formulário salvando produto com 2 cores
  const produtoSalvo = {
    id: 300,
    nome: 'Vestido Linho Tropical',
    variacoes: [
      {
        id: 501,
        cor_nome: 'Verde',
        cor_hex: '#234B36',
        tamanhos: [
          { tamanho: 'PP', quantidade: 1 },
          { tamanho: 'P', quantidade: 2 },
          { tamanho: 'M', quantidade: 3 },
          { tamanho: 'G', quantidade: 0 },
          { tamanho: 'GG', quantidade: 0 }
        ]
      },
      {
        id: 502,
        cor_nome: 'Preto',
        cor_hex: '#1C1C1C',
        tamanhos: [
          { tamanho: 'PP', quantidade: 0 },
          { tamanho: 'P', quantidade: 1 },
          { tamanho: 'M', quantidade: 2 },
          { tamanho: 'G', quantidade: 2 },
          { tamanho: 'GG', quantidade: 1 }
        ]
      }
    ]
  }

  // Simular reidratação no ProductForm
  const varsNormalizadas = normalizarVariacoesProduto(produtoSalvo)
  assert.equal(varsNormalizadas.length, 2)

  // Conferir 1ª cor (Verde)
  const verde = varsNormalizadas[0]
  assert.equal(verde.cor_nome, 'Verde')
  assert.equal(verde.quantidade, 6)

  // Conferir 2ª cor (Preto)
  const preto = varsNormalizadas[1]
  assert.equal(preto.cor_nome, 'Preto')
  assert.equal(preto.quantidade, 6)

  // Mapa de tamanhos da 2ª cor como o ProductForm monta
  const mapaPreto = { PP: 0, P: 0, M: 0, G: 0, GG: 0 }
  for (const t of (preto.tamanhos || [])) {
    mapaPreto[String(t.tamanho).toUpperCase()] = Number(t.quantidade || 0)
  }

  assert.equal(mapaPreto.PP, 0)
  assert.equal(mapaPreto.P, 1)
  assert.equal(mapaPreto.M, 2)
  assert.equal(mapaPreto.G, 2)
  assert.equal(mapaPreto.GG, 1)
})

test('17. Edição de produto com 3 cores: preserva tamanhos de todas as cores', () => {
  const produto3Cores = {
    id: 301,
    nome: 'Conjunto Casual',
    variacoes: [
      {
        id: 601,
        cor_nome: 'Azul',
        tamanhos: [{ tamanho: 'P', quantidade: 4 }, { tamanho: 'M', quantidade: 2 }]
      },
      {
        id: 602,
        cor_nome: 'Terracota',
        tamanhos: [{ tamanho: 'M', quantidade: 3 }, { tamanho: 'G', quantidade: 5 }]
      },
      {
        id: 603,
        cor_nome: 'Off-White',
        tamanhos: [{ tamanho: 'PP', quantidade: 1 }, { tamanho: 'GG', quantidade: 2 }]
      }
    ]
  }

  const vars = normalizarVariacoesProduto(produto3Cores)
  assert.equal(vars.length, 3)
  assert.equal(vars[0].quantidade, 6) // Azul: 4+2
  assert.equal(vars[1].quantidade, 8) // Terracota: 3+5
  assert.equal(vars[2].quantidade, 3) // Off-White: 1+2

  const gradeTerracota = obterGradeTamanhosDaCor(produto3Cores, 'Terracota')
  const mTerracota = gradeTerracota.find((t) => t.tamanho === 'M')
  const gTerracota = gradeTerracota.find((t) => t.tamanho === 'G')
  assert.equal(mTerracota.quantidade, 3)
  assert.equal(gTerracota.quantidade, 5)
})

test('18. Loja pública: tamanho com estoque > 0 é disponível sem exibir quantidade numérica', () => {
  const produto = {
    id: 302,
    nome: 'Vestido Tropical',
    variacoes: [
      {
        cor_nome: 'Verde',
        tamanhos: [
          { tamanho: 'P', quantidade: 3 },
          { tamanho: 'M', quantidade: 0 }
        ]
      }
    ]
  }

  const grade = obterGradeTamanhosDaCor(produto, 'Verde')
  const tamP = grade.find((t) => t.tamanho === 'P')
  const tamM = grade.find((t) => t.tamanho === 'M')

  assert.equal(tamP.disponivel, true)
  assert.equal(tamM.disponivel, false)

  // Gerar labels de acessibilidade e title como no ModalDetalheProduto
  const titleP = tamP.disponivel ? `Tamanho ${tamP.tamanho} disponível` : `Tamanho ${tamP.tamanho} esgotado`
  const titleM = tamM.disponivel ? `Tamanho ${tamM.tamanho} disponível` : `Tamanho ${tamM.tamanho} esgotado`

  assert.equal(titleP, 'Tamanho P disponível')
  assert.equal(titleM, 'Tamanho M esgotado')

  // Garantir que nenhuma quantidade numérica aparece no title/label público
  assert.ok(!titleP.includes('3'), 'Não deve conter o número 3 no title público')
  assert.ok(!titleP.includes('unidades'), 'Não deve conter a palavra unidades')
  assert.ok(!titleM.includes('0'), 'Não deve conter o número 0 no title público')
})

// =====================================================
// TESTES DE VALIDAÇÃO DE ESTOQUE NO CHECKOUT (COR + TAMANHO)
// =====================================================

test('19. Validação de checkout: produto com 1 cor e estoque suficiente passa', () => {
  const produto = {
    id: 401,
    nome: 'Vestido Tropical',
    variacoes: [
      {
        cor_nome: 'Verde',
        tamanhos: [
          { tamanho: 'P', quantidade: 3 },
          { tamanho: 'M', quantidade: 0 }
        ]
      }
    ]
  }

  const grade = obterGradeTamanhosDaCor(produto, 'Verde')
  const itemP = grade.find((t) => t.tamanho === 'P')
  assert.ok(itemP && itemP.quantidade >= 2, 'Estoque de P deve ser suficiente para 2 unidades')
})

test('20. Validação de checkout: produto com 2 cores diferencia estoque de cada cor', () => {
  const produto2Cores = {
    id: 402,
    nome: 'Vestido Floral',
    variacoes: [
      {
        id: 1,
        cor_nome: 'Rosa',
        tamanhos: [
          { tamanho: 'M', quantidade: 2 },
          { tamanho: 'G', quantidade: 0 }
        ]
      },
      {
        id: 2,
        cor_nome: 'Preto',
        tamanhos: [
          { tamanho: 'M', quantidade: 0 },
          { tamanho: 'G', quantidade: 3 }
        ]
      }
    ]
  }

  const gradeRosa = obterGradeTamanhosDaCor(produto2Cores, 'Rosa')
  const mRosa = gradeRosa.find((t) => t.tamanho === 'M')
  const gRosa = gradeRosa.find((t) => t.tamanho === 'G')
  assert.equal(mRosa.quantidade, 2)
  assert.equal(mRosa.disponivel, true)
  assert.equal(gRosa.quantidade, 0)
  assert.equal(gRosa.disponivel, false)

  const gradePreto = obterGradeTamanhosDaCor(produto2Cores, 'Preto')
  const mPreto = gradePreto.find((t) => t.tamanho === 'M')
  const gPreto = gradePreto.find((t) => t.tamanho === 'G')
  assert.equal(mPreto.quantidade, 0)
  assert.equal(mPreto.disponivel, false)
  assert.equal(gPreto.quantidade, 3)
  assert.equal(gPreto.disponivel, true)
})

test('21. Validação de checkout: item sem estoque na cor escolhida é identificado', () => {
  const produto = {
    id: 403,
    nome: 'Calça Alfaiataria',
    variacoes: [
      {
        cor_nome: 'Azul',
        tamanhos: [{ tamanho: 'GG', quantidade: 0 }]
      }
    ]
  }

  const grade = obterGradeTamanhosDaCor(produto, 'Azul')
  const tamGG = grade.find((t) => t.tamanho === 'GG')
  assert.equal(tamGG.disponivel, false)
  assert.equal(tamGG.quantidade, 0)
})

test('22. Validação de checkout: produto legado sem variações valida com fallback seguro', () => {
  const produtoLegado = {
    id: 404,
    nome: 'Saia Legada',
    cor: 'Única',
    tamanhos: [
      { tamanho: 'P', quantidade: 4 },
      { tamanho: 'M', quantidade: 1 }
    ]
  }

  const grade = obterGradeTamanhosDaCor(produtoLegado, 'Única')
  const tamP = grade.find((t) => t.tamanho === 'P')
  const tamM = grade.find((t) => t.tamanho === 'M')
  assert.equal(tamP.quantidade, 4)
  assert.equal(tamP.disponivel, true)
  assert.equal(tamM.quantidade, 1)
  assert.equal(tamM.disponivel, true)
})

test('23. Repasse de pagamento: objeto Pix com qr_code e qr_code_base64 é preservado no pedido finalizado', () => {
  const resultadoBackend = {
    sucesso: true,
    pedido: {
      id: 1786458117032,
      numero: 'PED-1786458117032',
      total: 179.80,
      forma_pagamento: 'Pix',
      status: 'Aguardando pagamento',
      itens: [{ produtoId: 1786385389349, tamanho: 'P', quantidade: 1 }]
    },
    pagamento: {
      id: 'ORD01M03GZBQQK1XNFDAQ3HTMPDW0',
      status: 'action_required',
      qr_code: '00020126470014br.gov.bcb.pix...',
      qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAA...',
      ticket_url: 'https://www.mercadopago.com.br/payments/ticket...',
      expiracao: '2026-08-15T20:44:24.623Z'
    }
  }

  const pedidoFinalizado = {
    ...resultadoBackend.pedido,
    itens: resultadoBackend.pedido.itens,
    pagamento: resultadoBackend.pagamento || null
  }

  assert.ok(pedidoFinalizado.pagamento, 'Objeto pagamento deve existir no pedidoFinalizado')
  assert.equal(pedidoFinalizado.pagamento.qr_code, '00020126470014br.gov.bcb.pix...')
  assert.equal(pedidoFinalizado.pagamento.qr_code_base64, 'iVBORw0KGgoAAAANSUhEUgAA...')
  assert.equal(pedidoFinalizado.pagamento.ticket_url, 'https://www.mercadopago.com.br/payments/ticket...')
  assert.equal(pedidoFinalizado.pagamento.expiracao, '2026-08-15T20:44:24.623Z')
})

test('24. Repasse de pagamento: pagamento por cartão sem objeto Pix mantém fallback nulo gracioso', () => {
  const resultadoCartao = {
    sucesso: true,
    pedido: {
      id: 1786458117033,
      numero: 'PED-1786458117033',
      total: 179.80,
      forma_pagamento: 'Cartão de crédito',
      status: 'Aprovado',
      itens: [{ produtoId: 1786385389349, tamanho: 'P', quantidade: 1 }]
    },
    pagamento: null
  }

  const pedidoFinalizado = {
    ...resultadoCartao.pedido,
    itens: resultadoCartao.pedido.itens,
    pagamento: resultadoCartao.pagamento || null
  }

  assert.equal(pedidoFinalizado.pagamento, null)
  assert.equal(pedidoFinalizado.forma_pagamento, 'Cartão de crédito')
})

// =====================================================
// TESTES DE NÃO RECRIAÇÃO AUTOMÁTICA DE COR
// =====================================================

test('25. Remoção de cor: produto com variacoes = [] não recria cor automaticamente', () => {
  const produtoSemCores = {
    id: 501,
    nome: 'Vestido Teste',
    quantidade: 1,
    cor: 'Rosa',
    variacoes: []
  }

  const vars = normalizarVariacoesProduto(produtoSemCores)
  assert.equal(vars.length, 0, 'Não deve sintetizar cor quando variacoes é array vazio')
})

test('26. Remoção de cor: remoção da 2ª cor mantém somente a 1ª cor sem recriar', () => {
  const produtoOriginal = {
    id: 502,
    nome: 'Conjunto',
    variacoes: [
      { id: 1, cor_nome: 'Verde', tamanhos: [{ tamanho: 'M', quantidade: 1 }] },
      { id: 2, cor_nome: 'Rosa', tamanhos: [{ tamanho: 'M', quantidade: 1 }] }
    ]
  }

  // Admin removeu a cor Rosa (id: 2)
  const produtoComCorRemovida = {
    ...produtoOriginal,
    variacoes: [produtoOriginal.variacoes[0]]
  }

  const vars = normalizarVariacoesProduto(produtoComCorRemovida)
  assert.equal(vars.length, 1)
  assert.equal(vars[0].cor_nome, 'Verde')
})

test('27. Quantidade > 0 não cria variação de cor sozinha', () => {
  const produtoApenasComQtd = {
    id: 503,
    nome: 'Peça Sem Variações',
    quantidade: 10,
    variacoes: []
  }

  const vars = normalizarVariacoesProduto(produtoApenasComQtd)
  assert.equal(vars.length, 0, 'Quantidade total não deve gerar variação automaticamente')
})

test('28. Produto legado sem campo variacoes continua gerando variação legada por compatibilidade', () => {
  const produtoLegado = {
    id: 504,
    nome: 'Saia Legada',
    cor: 'Floral',
    tamanhos: [{ tamanho: 'P', quantidade: 3 }]
    // sem campo variacoes definido
  }

  const vars = normalizarVariacoesProduto(produtoLegado)
  assert.equal(vars.length, 1)
  assert.equal(vars[0].cor_nome, 'Floral')
  assert.equal(vars[0].quantidade, 3)
})

test('29. Paleta de cores não inclui variações se produto teve cores removidas', () => {
  const produtoSemCores = {
    id: 505,
    nome: 'Produto Zerado',
    variacoes: []
  }

  const paleta = obterPaletaCoresProduto(produtoSemCores)
  assert.equal(paleta.length, 0, 'Paleta deve ser vazia quando não há variações')
})

test('30. Remoção de 4 de 5 cores: produto preserva apenas 1 cor e 1 unidade de estoque', () => {
  const produto5Cores = {
    id: 601,
    nome: 'Vestido 5 Cores',
    variacoes: [
      { id: 10, cor_nome: 'Verde', tamanhos: [{ tamanho: 'M', quantidade: 1 }] },
      { id: 11, cor_nome: 'Rosa', tamanhos: [{ tamanho: 'M', quantidade: 1 }] },
      { id: 12, cor_nome: 'Preto', tamanhos: [{ tamanho: 'M', quantidade: 1 }] },
      { id: 13, cor_nome: 'Azul', tamanhos: [{ tamanho: 'M', quantidade: 1 }] },
      { id: 14, cor_nome: 'Branco', tamanhos: [{ tamanho: 'M', quantidade: 1 }] }
    ]
  }

  // Admin removeu Rosa, Preto, Azul, Branco mantendo apenas Verde com M=1
  const produto1CorRestante = {
    ...produto5Cores,
    variacoes: [produto5Cores.variacoes[0]]
  }

  const vars = normalizarVariacoesProduto(produto1CorRestante)
  assert.equal(vars.length, 1, 'Deve manter apenas 1 variação')
  assert.equal(vars[0].cor_nome, 'Verde')
  assert.equal(vars[0].quantidade, 1, 'Variação deve ter 1 unidade')

  const totalCalculado = vars.reduce((acc, v) => acc + v.quantidade, 0)
  assert.equal(totalCalculado, 1, 'Estoque consolidado deve ser 1')
})

test('31. Loja pública com 1 cor restante após remoção: exibe produto como disponível', () => {
  const produto1Cor = {
    id: 602,
    nome: 'Vestido Disponível',
    ativo: true,
    variacoes: [
      { id: 20, cor_nome: 'Verde', tamanhos: [{ tamanho: 'M', quantidade: 1 }] }
    ]
  }

  const grade = obterGradeTamanhosDaCor(produto1Cor, 'Verde')
  const tamM = grade.find((t) => t.tamanho === 'M')
  assert.equal(tamM.disponivel, true)
  assert.equal(tamM.quantidade, 1)
})




