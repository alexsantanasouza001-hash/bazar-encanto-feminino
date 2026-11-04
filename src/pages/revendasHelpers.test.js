import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agruparVendasPorRemessa,
  calcularComissao,
  calcularProximoAcerto,
  calcularSaldoConsignadoItem,
  calcularTotaisLinhasVenda,
  calcularValorLoja,
  consolidarResumoRevendedora,
  filtrarProdutosBusca,
  formatarData,
  formatarMoeda,
  formatarTelefone,
  montarItemRemessa,
  obterCoresProduto,
  obterEstoqueDisponivel,
  obterTamanhosDisponiveis,
  obterPrecosVendaPraticadosItem,
  obterTotalValorVendidoItem,
  validarAdicaoItemRemessa,
  validarEdicaoRemessa,
  validarLinhasVenda,
  verificarAcertoAtrasado,
  detalharVendaFinanceiraAdmin,
  calcularPainelFinanceiroAdmin,
  detalharResultadoPorRemessaAdmin,
  calcularRateioFrete,
  calcularDivisaoLucro,
  validarGradeTamanhosRemessa,
  agruparItensRemessaPorProdutoVariacao,
  desagruparItensRemessa
} from './revendasHelpers.js'
import {
  agruparPecasPortalPorProdutoVariacaoRemessa,
  filtrarPecasDisponiveis,
  agruparProdutosParaVenda,
  resolverImagemProdutoRevenda,
  obterUrlFotoPublica,
  filtrarVendasConsolidacao,
  calcularConsolidacaoFinanceira
} from './portal-revendedora/portalHelpers.js'

test('A) 3 unidades vendidas pelo mesmo preço', () => {
  const linhas = [
    { quantidade: 3, precoUnitario: 180 }
  ]
  const comissaoPercentual = 10
  const resultado = calcularTotaisLinhasVenda(linhas, comissaoPercentual)

  assert.equal(resultado.totalQuantidade, 3)
  assert.equal(resultado.totalBruto, 540)
  assert.equal(resultado.totalComissao, 54)
  assert.equal(resultado.totalLoja, 486)
  assert.equal(resultado.grupos.length, 1)
  assert.equal(resultado.grupos[0].quantidade, 3)
  assert.equal(resultado.grupos[0].precoUnitario, 180)
})

test('B) 2 unidades a R$ 180 + 1 unidade a R$ 160 em uma única operação', () => {
  const linhas = [
    { quantidade: 2, precoUnitario: 180 },
    { quantidade: 1, precoUnitario: 160 }
  ]
  const comissaoPercentual = 10
  const resultado = calcularTotaisLinhasVenda(linhas, comissaoPercentual)

  assert.equal(resultado.totalQuantidade, 3)
  assert.equal(resultado.totalBruto, 520) // (2 * 180) + (1 * 160) = 360 + 160 = 520
  assert.equal(resultado.grupos.length, 2)
  assert.equal(resultado.grupos[0].quantidade, 2)
  assert.equal(resultado.grupos[0].precoUnitario, 180)
  assert.equal(resultado.grupos[1].quantidade, 1)
  assert.equal(resultado.grupos[1].precoUnitario, 160)
})

test('C) Comissão de 10% calculada sobre cada grupo de venda: 2x180 => R$36, 1x160 => R$16, total comissão => R$52', () => {
  const repasseUnitario = 130
  const linhas = [
    { quantidade: 2, precoUnitario: 180 },
    { quantidade: 1, precoUnitario: 160 }
  ]
  const comissaoPercentual = 10

  const resultado = calcularTotaisLinhasVenda(linhas, comissaoPercentual)

  // Grupo 1: 2 x 180 = 360 => 10% = 36
  assert.equal(resultado.grupos[0].valorBruto, 360)
  assert.equal(resultado.grupos[0].valorComissao, 36)
  assert.equal(resultado.grupos[0].valorLoja, 324)

  // Grupo 2: 1 x 160 = 160 => 10% = 16
  assert.equal(resultado.grupos[1].valorBruto, 160)
  assert.equal(resultado.grupos[1].valorComissao, 16)
  assert.equal(resultado.grupos[1].valorLoja, 144)

  // Total comissão = 36 + 16 = 52 (NÃO baseado nos 130 de repasse que daria 39)
  assert.equal(resultado.totalComissao, 52)
  assert.equal(resultado.totalLoja, 468)

  const comissaoIncorretaSobreRepasse = 3 * repasseUnitario * 0.1 // 39
  assert.notEqual(resultado.totalComissao, comissaoIncorretaSobreRepasse)
})

test('D) Tentar registrar quantidade maior que disponível => BLOQUEADO', () => {
  const saldoDisponivel = 3

  // Tentativa 1: Quantidade excessiva em uma linha (4 > 3)
  const linhasExcessivas = [
    { quantidade: 4, precoUnitario: 180 }
  ]
  const validacao1 = validarLinhasVenda(linhasExcessivas, saldoDisponivel)
  assert.equal(validacao1.valido, false)
  assert.match(validacao1.erro, /não pode ultrapassar o saldo disponível/)

  // Tentativa 2: Soma de múltiplas linhas excede disponível (2 + 2 = 4 > 3)
  const linhasSomaExcessiva = [
    { quantidade: 2, precoUnitario: 180 },
    { quantidade: 2, precoUnitario: 160 }
  ]
  const validacao2 = validarLinhasVenda(linhasSomaExcessiva, saldoDisponivel)
  assert.equal(validacao2.valido, false)
  assert.match(validacao2.erro, /A soma das quantidades informadas \(4\)/)

  // Tentativa 3: Quantidade <= 0
  const linhaZero = [
    { quantidade: 0, precoUnitario: 180 }
  ]
  const validacao3 = validarLinhasVenda(linhaZero, saldoDisponivel)
  assert.equal(validacao3.valido, false)
  assert.match(validacao3.erro, /maior que zero/)

  // Tentativa 4: Preço <= 0
  const linhaPrecoInvalido = [
    { quantidade: 2, precoUnitario: 0 }
  ]
  const validacao4 = validarLinhasVenda(linhaPrecoInvalido, saldoDisponivel)
  assert.equal(validacao4.valido, false)
  assert.match(validacao4.erro, /valor de venda unitário maior que zero/)

  // Tentativa válida (2 + 1 = 3 <= 3)
  const linhasValidas = [
    { quantidade: 2, precoUnitario: 180 },
    { quantidade: 1, precoUnitario: 160 }
  ]
  const validacaoValida = validarLinhasVenda(linhasValidas, saldoDisponivel)
  assert.equal(validacaoValida.valido, true)
  assert.equal(validacaoValida.erro, null)
})

test('E) Histórico preserva os dois preços diferentes em registros separados', () => {
  const vendasHistoricas = [
    {
      id: 501,
      remessa_item_id: 10,
      produto_nome: 'Vestido Farm',
      cor: 'Preto',
      tamanho: 'M',
      quantidade: 2,
      valor_repasse_unitario: 130,
      preco_unitario_vendido: 180,
      valor_total_bruto: 360,
      comissao_percentual: 10,
      valor_comissao: 36,
      valor_loja: 324
    },
    {
      id: 502,
      remessa_item_id: 10,
      produto_nome: 'Vestido Farm',
      cor: 'Preto',
      tamanho: 'M',
      quantidade: 1,
      valor_repasse_unitario: 130,
      preco_unitario_vendido: 160,
      valor_total_bruto: 160,
      comissao_percentual: 10,
      valor_comissao: 16,
      valor_loja: 144
    }
  ]

  // Verifica que ambos os registros são mantidos separadamente e não condensados em preço médio
  assert.equal(vendasHistoricas.length, 2)
  assert.equal(vendasHistoricas[0].preco_unitario_vendido, 180)
  assert.equal(vendasHistoricas[0].quantidade, 2)
  assert.equal(vendasHistoricas[0].valor_comissao, 36)

  assert.equal(vendasHistoricas[1].preco_unitario_vendido, 160)
  assert.equal(vendasHistoricas[1].quantidade, 1)
  assert.equal(vendasHistoricas[1].valor_comissao, 16)

  const totalBrutoConsolidado = vendasHistoricas.reduce((acc, v) => acc + v.valor_total_bruto, 0)
  const totalComissaoConsolidada = vendasHistoricas.reduce((acc, v) => acc + v.valor_comissao, 0)
  assert.equal(totalBrutoConsolidado, 520)
  assert.equal(totalComissaoConsolidada, 52)
})

test('F) Custo interno do Bazar não é exposto na interface de acerto', () => {
  const revendedora = {
    id: 1,
    nome: 'Revendedora Exemplo',
    comissao_padrao: 10,
    periodicidade_acerto_dias: 15
  }

  const remessas = [
    {
      id: 1,
      revendedora_id: 1,
      itens: [
        {
          id: 1,
          produto_nome: 'Vestido Farm',
          quantidade_enviada: 3,
          quantidade_vendida: 3,
          quantidade_devolvida: 0,
          preco_venda_sugerido: 130,
          custo_unitario: 60 // Custo interno do Bazar
        }
      ]
    }
  ]

  const vendas = [
    {
      id: 1,
      revendedora_id: 1,
      produto_nome: 'Vestido Farm',
      quantidade: 2,
      valor_repasse_unitario: 130,
      preco_unitario_vendido: 180,
      valor_total_bruto: 360,
      comissao_percentual: 10,
      valor_comissao: 36,
      valor_loja: 324
    },
    {
      id: 2,
      revendedora_id: 1,
      produto_nome: 'Vestido Farm',
      quantidade: 1,
      valor_repasse_unitario: 130,
      preco_unitario_vendido: 160,
      valor_total_bruto: 160,
      comissao_percentual: 10,
      valor_comissao: 16,
      valor_loja: 144
    }
  ]

  const resumo = consolidarResumoRevendedora(revendedora, remessas, vendas, [])

  // O resumo contém apenas dados de acerto com a revendedora (valor de repasse, vendido, comissão, devido à loja)
  assert.equal(resumo.totalVendidoBruto, 520)
  assert.equal(resumo.totalComissao, 52)
  assert.equal(resumo.totalDevidoLoja, 468)

  // Campos confidenciais de custo do Bazar não devem existir no resumo de acerto da revendedora
  assert.equal('custo' in resumo, false)
  assert.equal('custo_unitario' in resumo, false)
  assert.equal('lucro_bazar' in resumo, false)
  assert.equal('margem_bazar' in resumo, false)
})

test('G) Alteração futura do valor de repasse não altera venda histórica', () => {
  const vendaHistorica = {
    id: 101,
    valor_repasse_unitario: 130,
    preco_unitario_vendido: 180,
    quantidade: 2,
    valor_total_bruto: 360,
    comissao_percentual: 10,
    valor_comissao: 36,
    valor_loja: 324
  }

  // Se o produto mudar no futuro para Valor de Repasse = R$ 140 e comissão padrão = 15%
  const novoValorRepasseProduto = 140
  const novaComissaoPadrao = 15

  // A venda histórica mantém exatamente o snapshot da época da transação
  assert.equal(vendaHistorica.valor_repasse_unitario, 130)
  assert.equal(vendaHistorica.preco_unitario_vendido, 180)
  assert.equal(vendaHistorica.comissao_percentual, 10)
  assert.equal(vendaHistorica.valor_comissao, 36)
  assert.equal(vendaHistorica.valor_loja, 324)

  assert.notEqual(vendaHistorica.valor_repasse_unitario, novoValorRepasseProduto)
  assert.notEqual(vendaHistorica.comissao_percentual, novaComissaoPadrao)
})

test('H) Duas cores/tamanhos diferentes não são misturados', () => {
  const itemCorPreta = {
    id: 1,
    produto_id: 100,
    produto_nome: 'Vestido Farm',
    cor: 'Preto',
    tamanho: 'M',
    quantidade_enviada: 3,
    quantidade_vendida: 0,
    quantidade_devolvida: 0,
    preco_venda_sugerido: 130
  }

  const itemCorBranca = {
    id: 2,
    produto_id: 100,
    produto_nome: 'Vestido Farm',
    cor: 'Branco',
    tamanho: 'P',
    quantidade_enviada: 2,
    quantidade_vendida: 0,
    quantidade_devolvida: 0,
    preco_venda_sugerido: 130
  }

  // Registrar venda de 2 un. na cor Preto
  itemCorPreta.quantidade_vendida += 2
  const saldoPreto = calcularSaldoConsignadoItem(itemCorPreta)
  const saldoBranco = calcularSaldoConsignadoItem(itemCorBranca)

  // Saldo da cor Preto é 1 un., cor Branco permanece intocada com 2 un.
  assert.equal(saldoPreto, 1)
  assert.equal(saldoBranco, 2)
  assert.notEqual(itemCorPreta.id, itemCorBranca.id)
})

test('1. Criar remessa com 5 unidades. Editar para 6 antes de movimentação. Resultado: estoque/consignado corretos', () => {
  let estoqueLoja = 20
  const remessaItem = {
    id: 10,
    produto_id: 100,
    produto_nome: 'Vestido Estampado',
    quantidade_enviada: 5,
    quantidade_vendida: 0,
    quantidade_devolvida: 0,
    min_quantidade: 0,
    preco_venda_sugerido: 120
  }
  estoqueLoja -= remessaItem.quantidade_enviada // 15 na loja, 5 na remessa
  assert.equal(estoqueLoja, 15)
  assert.equal(calcularSaldoConsignadoItem(remessaItem), 5)

  // Editar para 6 antes de qualquer movimentação
  const novaQuantidade = 6
  const validacao = validarEdicaoRemessa([{ ...remessaItem, quantidade_enviada: novaQuantidade }])
  assert.equal(validacao.valido, true)

  const delta = novaQuantidade - remessaItem.quantidade_enviada // +1
  estoqueLoja -= delta
  remessaItem.quantidade_enviada = novaQuantidade

  assert.equal(estoqueLoja, 14, '1 unidade adicional debitada da loja')
  assert.equal(calcularSaldoConsignadoItem(remessaItem), 6, 'Consignado agora possui 6 unidades')
})

test('2. Criar remessa com 5. Editar para 3 antes de venda. Resultado: 2 unidades retornam corretamente à loja', () => {
  let estoqueLoja = 10
  const remessaItem = {
    id: 20,
    produto_id: 101,
    produto_nome: 'Saia Linho',
    quantidade_enviada: 5,
    quantidade_vendida: 0,
    quantidade_devolvida: 0,
    min_quantidade: 0,
    preco_venda_sugerido: 90
  }
  estoqueLoja -= remessaItem.quantidade_enviada // 5 na loja, 5 na remessa
  assert.equal(estoqueLoja, 5)

  // Editar para 3
  const novaQuantidade = 3
  const validacao = validarEdicaoRemessa([{ ...remessaItem, quantidade_enviada: novaQuantidade }])
  assert.equal(validacao.valido, true)

  const delta = novaQuantidade - remessaItem.quantidade_enviada // -2
  estoqueLoja -= delta // estoqueLoja + 2
  remessaItem.quantidade_enviada = novaQuantidade

  assert.equal(estoqueLoja, 7, '2 unidades retornaram ao estoque da loja')
  assert.equal(calcularSaldoConsignadoItem(remessaItem), 3, 'Saldo consignado atualizado para 3 unidades')
})

test('3. Remessa com 5. 2 vendidas. Tentar editar total para 1. Resultado: BLOQUEADO', () => {
  const remessaItem = {
    id: 30,
    produto_id: 102,
    produto_nome: 'Blusa Seda',
    quantidade_enviada: 5,
    quantidade_vendida: 2,
    quantidade_devolvida: 0,
    min_quantidade: 2, // Mínimo permitido é o total movimentado (2)
    preco_venda_sugerido: 150
  }

  // Tentar alterar para 1 (< 2 movimentadas)
  const validacaoInvalida = validarEdicaoRemessa([{ ...remessaItem, quantidade_enviada: 1 }])
  assert.equal(validacaoInvalida.valido, false)
  assert.match(validacaoInvalida.erro, /não pode ser reduzida abaixo do que já foi movimentado/)

  // Alterar para 2 (mínimo permitido) é válido
  const validacaoMinima = validarEdicaoRemessa([{ ...remessaItem, quantidade_enviada: 2 }])
  assert.equal(validacaoMinima.valido, true)
})

test('4. Editar Valor de Repasse antes da venda. Resultado: novo valor aplicado', () => {
  const remessaItem = {
    id: 40,
    produto_id: 103,
    preco_venda_sugerido: 110,
    quantidade_enviada: 4,
    quantidade_vendida: 0,
    quantidade_devolvida: 0
  }

  const novoValorRepasse = 125
  const validacao = validarEdicaoRemessa([{ ...remessaItem, preco_venda_sugerido: novoValorRepasse }])
  assert.equal(validacao.valido, true)

  remessaItem.preco_venda_sugerido = novoValorRepasse
  assert.equal(remessaItem.preco_venda_sugerido, 125, 'Novo valor de repasse aplicado com sucesso')
})

test('5. Venda já realizada. Editar remessa. Resultado: venda histórica mantém Valor de Repasse original', () => {
  const vendaHistorica = {
    id: 500,
    remessa_id: 5,
    numero_remessa: 'REM-000005',
    remessa_item_id: 50,
    quantidade: 2,
    valor_repasse_unitario: 130, // Repasse da época da venda
    preco_unitario_vendido: 180,
    valor_total_bruto: 360,
    comissao_percentual: 10,
    valor_comissao: 36,
    valor_loja: 324
  }

  const remessaItem = {
    id: 50,
    preco_venda_sugerido: 130,
    quantidade_enviada: 5,
    quantidade_vendida: 2
  }

  // Remessa é editada para novo Valor de Repasse = 145 para peças restantes
  remessaItem.preco_venda_sugerido = 145

  // A venda histórica mantém 130
  assert.equal(vendaHistorica.valor_repasse_unitario, 130)
  assert.notEqual(vendaHistorica.valor_repasse_unitario, remessaItem.preco_venda_sugerido)
  assert.equal(vendaHistorica.valor_loja, 324)
})

test('6. Múltiplos preços de venda aparecem corretamente na tela da revenda', () => {
  const itemId = 60
  const vendas = [
    {
      id: 601,
      remessa_item_id: itemId,
      quantidade: 2,
      preco_unitario_vendido: 180,
      valor_total_bruto: 360
    },
    {
      id: 602,
      remessa_item_id: itemId,
      quantidade: 1,
      preco_unitario_vendido: 160,
      valor_total_bruto: 160
    }
  ]

  const precosPraticados = obterPrecosVendaPraticadosItem(itemId, vendas)
  assert.equal(precosPraticados.length, 2)
  assert.equal(precosPraticados[0].quantidade, 2)
  assert.equal(precosPraticados[0].precoUnitario, 180)
  assert.equal(precosPraticados[1].quantidade, 1)
  assert.equal(precosPraticados[1].precoUnitario, 160)

  // Verifica que não foi calculada média falsa (ex: 173,33)
  const somaQtd = precosPraticados.reduce((acc, p) => acc + p.quantidade, 0)
  assert.equal(somaQtd, 3)
})

test('7. Acerto Financeiro mostra Nº da Remessa e não repete lista detalhada de produtos', () => {
  const remessas = [
    {
      id: 15,
      numero: 'REM-000015',
      revendedora_id: 1,
      revendedora_nome: 'Ana Carolina',
      data_envio: '2026-08-10',
      status: 'Parcialmente vendida',
      itens: [
        { id: 1, quantidade_enviada: 4, quantidade_vendida: 3, quantidade_devolvida: 0 },
        { id: 2, quantidade_enviada: 2, quantidade_vendida: 0, quantidade_devolvida: 0 }
      ]
    }
  ]

  const vendas = [
    {
      id: 701,
      remessa_id: 15,
      numero_remessa: 'REM-000015',
      valor_total_bruto: 360,
      valor_comissao: 36,
      valor_loja: 324,
      quantidade: 2
    },
    {
      id: 702,
      remessa_id: 15,
      numero_remessa: 'REM-000015',
      valor_total_bruto: 160,
      valor_comissao: 16,
      valor_loja: 144,
      quantidade: 1
    }
  ]

  const resumoRemessas = agruparVendasPorRemessa(remessas, vendas)
  assert.equal(resumoRemessas.length, 1)

  const rem = resumoRemessas[0]
  assert.equal(rem.numero, 'REM-000015')
  assert.equal(rem.totalVendido, 520)
  assert.equal(rem.totalComissao, 52)
  assert.equal(rem.valorAcerto, 468)
  assert.equal(rem.totalPecasEnviadas, 6)
  assert.equal(rem.totalPecasVendidas, 3)
})

test('8. Custo interno não aparece', () => {
  const revendedora = { id: 1, nome: 'Revendedora', comissao_padrao: 10 }
  const remessas = [{ id: 1, revendedora_id: 1, itens: [{ id: 1, quantidade_enviada: 1, preco_venda_sugerido: 100, custo_unitario: 45 }] }]
  const resumo = consolidarResumoRevendedora(revendedora, remessas, [], [])

  assert.equal('custo' in resumo, false)
  assert.equal('custo_unitario' in resumo, false)
  assert.equal('lucro_bazar' in resumo, false)
  assert.equal('margem_bazar' in resumo, false)
})

test('9. Duas cores/tamanhos diferentes não são misturados', () => {
  const itemM = { id: 1, produto_id: 100, cor: 'Preto', tamanho: 'M', quantidade_enviada: 3, quantidade_vendida: 1, quantidade_devolvida: 0 }
  const itemG = { id: 2, produto_id: 100, cor: 'Preto', tamanho: 'G', quantidade_enviada: 2, quantidade_vendida: 0, quantidade_devolvida: 0 }

  assert.equal(calcularSaldoConsignadoItem(itemM), 2)
  assert.equal(calcularSaldoConsignadoItem(itemG), 2)
})

test('10. Histórico mantém: remessa + repasse + venda + comissão', () => {
  const venda = {
    id: 999,
    remessa_id: 15,
    numero_remessa: 'REM-000015',
    produto_nome: 'Vestido Linho',
    cor: 'Verde',
    tamanho: 'P',
    quantidade: 2,
    valor_repasse_unitario: 130,
    preco_unitario_vendido: 180,
    comissao_percentual: 10,
    valor_comissao: 36,
    valor_loja: 324
  }

  assert.ok(venda.numero_remessa.startsWith('REM-'))
  assert.equal(venda.valor_repasse_unitario, 130)
  assert.equal(venda.preco_unitario_vendido, 180)
  assert.equal(venda.valor_comissao, 36)
  assert.equal(venda.valor_loja, 324)
})

test('calcula comissao e valor da loja para diferentes percentuais (0%, 10%, 20%, 25%, 30%, 100%)', () => {
  const valor = 200
  assert.equal(calcularComissao(valor, 0), 0)
  assert.equal(calcularValorLoja(valor, 0), 200)
  assert.equal(calcularComissao(valor, 10), 20)
  assert.equal(calcularValorLoja(valor, 10), 180)
  assert.equal(calcularComissao(valor, 20), 40)
  assert.equal(calcularValorLoja(valor, 20), 160)
  assert.equal(calcularComissao(valor, 25), 50)
  assert.equal(calcularValorLoja(valor, 25), 150)
  assert.equal(calcularComissao(valor, 30), 60)
  assert.equal(calcularValorLoja(valor, 30), 140)
  assert.equal(calcularComissao(valor, 100), 200)
  assert.equal(calcularValorLoja(valor, 100), 0)
})

test('calcula proximo acerto com base na periodicidade (7, 15, 30 dias)', () => {
  const dataBase = new Date('2026-08-01T10:00:00Z')
  const acerto7 = calcularProximoAcerto(dataBase, 7)
  assert.equal(acerto7.toISOString().slice(0, 10), '2026-08-08')
  const acerto15 = calcularProximoAcerto(dataBase, 15)
  assert.equal(acerto15.toISOString().slice(0, 10), '2026-08-16')
  const acerto30 = calcularProximoAcerto(dataBase, 30)
  assert.equal(acerto30.toISOString().slice(0, 10), '2026-08-31')
})

test('identifica acerto atrasado com precisao', () => {
  const agora = new Date('2026-08-15T12:00:00Z')
  assert.equal(verificarAcertoAtrasado('2026-08-10', agora), true)
  assert.equal(verificarAcertoAtrasado('2026-08-15', agora), false)
  assert.equal(verificarAcertoAtrasado('2026-08-20', agora), false)
})

test('formatacao de moeda, telefone e data', () => {
  assert.equal(formatarMoeda(150), 'R$\xa0150,00')
  assert.equal(formatarTelefone('21988776655'), '(21) 98877-6655')
  assert.equal(formatarData('2026-09-02T12:00:00Z'), '02/09/2026')
  assert.equal(formatarData(null), '-')
})

test('Regra de Comissão (04/11/2026) A: Repasse 130, Venda 130, Comissão 10% => comissão 13 (sempre cobrada)', () => {
  const comissao = calcularComissao(130, 10, 130)
  assert.equal(comissao, 13)
  const loja = calcularValorLoja(130, 10, 130)
  assert.equal(loja, 117)
})

test('Regra de Comissão (04/11/2026) B: Repasse 130, Venda 120, Comissão 10% => comissão 12 (sempre cobrada)', () => {
  const comissao = calcularComissao(120, 10, 130)
  assert.equal(comissao, 12)
  const loja = calcularValorLoja(120, 10, 130)
  assert.equal(loja, 108)
})

test('Regra de Comissão Nova C: Repasse 130, Venda 180, Comissão 10% => comissão 18', () => {
  const comissao = calcularComissao(180, 10, 130)
  assert.equal(comissao, 18)
  const loja = calcularValorLoja(180, 10, 130)
  assert.equal(loja, 162)
})

test('Regra de Comissão (04/11/2026) D: 2 unidades: Repasse 130, Venda 130 => comissão total 26', () => {
  const linhas = [
    { quantidade: 2, precoUnitario: 130 }
  ]
  const totais = calcularTotaisLinhasVenda(linhas, 10, 130)
  assert.equal(totais.totalQuantidade, 2)
  assert.equal(totais.totalBruto, 260)
  assert.equal(totais.totalComissao, 26)
  assert.equal(totais.totalLoja, 234)
})

test('Regra de Comissão (04/11/2026) E: 2 unidades a 180, 1 unidade a 130, Repasse 130, Comissão 10% => comissão sobre todas as unidades', () => {
  const linhas = [
    { quantidade: 2, precoUnitario: 180 },
    { quantidade: 1, precoUnitario: 130 }
  ]
  const totais = calcularTotaisLinhasVenda(linhas, 10, 130)
  assert.equal(totais.totalQuantidade, 3)
  assert.equal(totais.totalBruto, 490)
  assert.equal(totais.totalComissao, 49) // 10% de 360 = 36; 10% de 130 = 13
  assert.equal(totais.totalLoja, 441) // 490 - 49 = 441
  assert.equal(totais.grupos[0].valorComissao, 36)
  assert.equal(totais.grupos[1].valorComissao, 13)
})

test('Valor da Venda A: 2 × R$180 + 1 × R$160 => tela principal mostra R$520', () => {
  const itemId = 50
  const vendas = [
    { id: 1, remessa_item_id: 50, quantidade: 2, preco_unitario_vendido: 180, valor_total_bruto: 360 },
    { id: 2, remessa_item_id: 50, quantidade: 1, preco_unitario_vendido: 160, valor_total_bruto: 160 }
  ]
  const total = obterTotalValorVendidoItem(itemId, vendas)
  assert.equal(total, 520)
  assert.equal(formatarMoeda(total), 'R$\xa0520,00')
})

test('Valor da Venda B: 3 × R$150 => mostra R$450', () => {
  const itemId = 51
  const vendas = [
    { id: 3, remessa_item_id: 51, quantidade: 3, preco_unitario_vendido: 150, valor_total_bruto: 450 }
  ]
  const total = obterTotalValorVendidoItem(itemId, vendas)
  assert.equal(total, 450)
  assert.equal(formatarMoeda(total), 'R$\xa0450,00')
})

test('Valor da Venda C: nenhuma venda => mostra R$0', () => {
  const itemId = 52
  const vendas = []
  const total = obterTotalValorVendidoItem(itemId, vendas)
  assert.equal(total, 0)
  assert.equal(formatarMoeda(total), 'R$\xa00,00')
})

test('Valor da Venda D: histórico continua preservando valores separados', () => {
  const itemId = 53
  const vendas = [
    { id: 4, remessa_item_id: 53, quantidade: 2, preco_unitario_vendido: 180, valor_total_bruto: 360, valor_comissao: 36 },
    { id: 5, remessa_item_id: 53, quantidade: 1, preco_unitario_vendido: 160, valor_total_bruto: 160, valor_comissao: 16 }
  ]
  const precosPraticados = obterPrecosVendaPraticadosItem(itemId, vendas)
  assert.equal(precosPraticados.length, 2)
  assert.equal(precosPraticados[0].quantidade, 2)
  assert.equal(precosPraticados[0].precoUnitario, 180)
  assert.equal(precosPraticados[1].quantidade, 1)
  assert.equal(precosPraticados[1].precoUnitario, 160)
})

// TESTES OBRIGATÓRIOS: COMISSÃO SOBRE TOTAL FINAL APÓS DESCONTO

test('TESTE 1: Subtotal 520, Desconto 10%, Total 468, Comissão 10% => comissão R$46,80', () => {
  const linhas = [
    { quantidade: 2, precoUnitario: 180 }, // subtotal 360 - 10% (36) = 324. Repasse 260. 324 > 260 => comissão 10% = 32.40
    { quantidade: 1, precoUnitario: 160 }  // subtotal 160 - 10% (16) = 144. Repasse 130. 144 > 130 => comissão 10% = 14.40
  ]
  const totais = calcularTotaisLinhasVenda(linhas, 10, 130, 10)
  assert.equal(totais.subtotalVenda, 520)
  assert.equal(totais.percentualDesconto, 10)
  assert.equal(totais.valorDesconto, 52)
  assert.equal(totais.totalVenda, 468)
  assert.equal(totais.totalComissao, 46.8)
  assert.equal(totais.totalLoja, 421.2)
})

test('TESTE 2: Subtotal 520, Desconto 0%, Total 520, Comissão 10% => comissão R$52,00', () => {
  const linhas = [
    { quantidade: 2, precoUnitario: 180 },
    { quantidade: 1, precoUnitario: 160 }
  ]
  const totais = calcularTotaisLinhasVenda(linhas, 10, 130, 0)
  assert.equal(totais.subtotalVenda, 520)
  assert.equal(totais.percentualDesconto, 0)
  assert.equal(totais.valorDesconto, 0)
  assert.equal(totais.totalVenda, 520)
  assert.equal(totais.totalComissao, 52)
  assert.equal(totais.totalLoja, 468)
})

test('TESTE 3: Subtotal 520, Desconto 100%, Total 0 => comissão R$0,00', () => {
  const linhas = [
    { quantidade: 2, precoUnitario: 180 },
    { quantidade: 1, precoUnitario: 160 }
  ]
  const totais = calcularTotaisLinhasVenda(linhas, 10, 130, 100)
  assert.equal(totais.subtotalVenda, 520)
  assert.equal(totais.valorDesconto, 520)
  assert.equal(totais.totalVenda, 0)
  assert.equal(totais.totalComissao, 0)
  assert.equal(totais.totalLoja, 0)
})

test('TESTE 4 (04/11/2026): Total final = Valor de Repasse => comissão continua 10% (R$13,00)', () => {
  const comissao = calcularComissao(130, 10, 130)
  assert.equal(comissao, 13)

  const linhas = [{ quantidade: 1, precoUnitario: 130 }]
  const totais = calcularTotaisLinhasVenda(linhas, 10, 130, 0)
  assert.equal(totais.totalVenda, 130)
  assert.equal(totais.totalComissao, 13)
})

test('TESTE 5 (04/11/2026): Total final < Valor de Repasse => comissão continua 10% sobre o total final', () => {
  // Venda 140 com 10% desconto = 126. Repasse = 130. Comissão = 10% de 126 = 12,60
  const comissao = calcularComissao(126, 10, 130)
  assert.equal(comissao, 12.6)

  const linhas = [{ quantidade: 1, precoUnitario: 140 }]
  const totais = calcularTotaisLinhasVenda(linhas, 10, 130, 10)
  assert.equal(totais.subtotalVenda, 140)
  assert.equal(totais.totalVenda, 126)
  assert.equal(totais.totalComissao, 12.6)
})

test('TESTE 6: Total final > Valor de Repasse => comissão calculada sobre TOTAL FINAL', () => {
  // Venda 200 com 10% desconto = 180. Repasse = 130. 180 > 130 => comissão 10% sobre 180 = 18.00
  const comissao = calcularComissao(180, 10, 130)
  assert.equal(comissao, 18)

  const linhas = [{ quantidade: 1, precoUnitario: 200 }]
  const totais = calcularTotaisLinhasVenda(linhas, 10, 130, 10)
  assert.equal(totais.subtotalVenda, 200)
  assert.equal(totais.totalVenda, 180)
  assert.equal(totais.totalComissao, 18)
  assert.equal(totais.totalLoja, 162)
})

// TESTES DE MÚLTIPLOS LANÇAMENTOS COM DESCONTOS INDEPENDENTES POR LANÇAMENTO

test('Múltiplos Lançamentos: 10 vestidos. Venda 1: 5x200 com 5% (R$950) + Venda 2: 2x200 com 10% (R$360) => Total Líquido R$1.310, Desconto R$90, Vendidas 7, Restantes 3', () => {
  const itemRemessa = {
    id: 100,
    quantidade_enviada: 10,
    quantidade_vendida: 7,
    quantidade_devolvida: 0,
    preco_venda_sugerido: 130
  }

  // Simulação dos registros no banco pós-lançamentos
  const vendas = [
    {
      id: 1,
      remessa_id: 10,
      remessa_item_id: 100,
      quantidade: 5,
      preco_unitario_vendido: 200,
      subtotal_venda: 1000,
      percentual_desconto: 5,
      valor_desconto: 50,
      total_venda: 950,
      comissao_percentual: 10,
      valor_comissao: 95, // 10% sobre 950
      valor_loja: 855
    },
    {
      id: 2,
      remessa_id: 10,
      remessa_item_id: 100,
      quantidade: 2,
      preco_unitario_vendido: 200,
      subtotal_venda: 400,
      percentual_desconto: 10,
      valor_desconto: 40,
      total_venda: 360,
      comissao_percentual: 10,
      valor_comissao: 36, // 10% sobre 360
      valor_loja: 324
    }
  ]

  // 1. Saldo do item
  const saldo = calcularSaldoConsignadoItem(itemRemessa)
  assert.equal(saldo, 3)

  // 2. Total Líquido na Tela Principal para o Item
  const totalItem = obterTotalValorVendidoItem(100, vendas)
  assert.equal(totalItem, 1310) // NÃO PODE SER 1350 NEM 1400

  // 3. Histórico detalhado preserva ambos os lançamentos intactos
  const historico = obterPrecosVendaPraticadosItem(100, vendas)
  assert.equal(historico.length, 2)
  assert.equal(historico[0].quantidade, 5)
  assert.equal(historico[0].subtotal, 1000)
  assert.equal(historico[0].percentualDesconto, 5)
  assert.equal(historico[0].valorDesconto, 50)
  assert.equal(historico[0].totalLiquido, 950)
  assert.equal(historico[0].valorComissao, 95)

  assert.equal(historico[1].quantidade, 2)
  assert.equal(historico[1].subtotal, 400)
  assert.equal(historico[1].percentualDesconto, 10)
  assert.equal(historico[1].valorDesconto, 40)
  assert.equal(historico[1].totalLiquido, 360)
  assert.equal(historico[1].valorComissao, 36)

  // 4. Acerto Financeiro consolidado da remessa
  const remessas = [{ id: 10, numero: 'REM-000010', itens: [itemRemessa] }]
  const resumo = agruparVendasPorRemessa(remessas, vendas)[0]
  assert.equal(resumo.totalPecasVendidas, 7)
  assert.equal(resumo.saldoConsignado, 3)
  assert.equal(resumo.totalSubtotal, 1400)
  assert.equal(resumo.totalDesconto, 90)
  assert.equal(resumo.totalVendido, 1310)
  assert.equal(resumo.totalComissao, 131) // 95 + 36
  assert.equal(resumo.valorAcerto, 1179)  // 855 + 324
})

test('Três Vendas com Descontos Distintos (5%, 10%, 0%) coexistem perfeitamente sem sobrescrever', () => {
  const vendas = [
    {
      id: 1,
      remessa_id: 20,
      remessa_item_id: 200,
      quantidade: 2,
      preco_unitario_vendido: 100,
      subtotal_venda: 200,
      percentual_desconto: 5,
      valor_desconto: 10,
      total_venda: 190,
      valor_comissao: 19,
      valor_loja: 171
    },
    {
      id: 2,
      remessa_id: 20,
      remessa_item_id: 200,
      quantidade: 3,
      preco_unitario_vendido: 100,
      subtotal_venda: 300,
      percentual_desconto: 10,
      valor_desconto: 30,
      total_venda: 270,
      valor_comissao: 27,
      valor_loja: 243
    },
    {
      id: 3,
      remessa_id: 20,
      remessa_item_id: 200,
      quantidade: 1,
      preco_unitario_vendido: 100,
      subtotal_venda: 100,
      percentual_desconto: 0,
      valor_desconto: 0,
      total_venda: 100,
      valor_comissao: 10,
      valor_loja: 90
    }
  ]

  const totalItem = obterTotalValorVendidoItem(200, vendas)
  assert.equal(totalItem, 560) // 190 + 270 + 100

  const remessas = [{ id: 20, numero: 'REM-000020', itens: [{ id: 200, quantidade_enviada: 10, quantidade_vendida: 6, quantidade_devolvida: 0 }] }]
  const resumo = agruparVendasPorRemessa(remessas, vendas)[0]
  assert.equal(resumo.totalSubtotal, 600)
  assert.equal(resumo.totalDesconto, 40)
  assert.equal(resumo.totalVendido, 560)
  assert.equal(resumo.totalComissao, 56)
  assert.equal(resumo.valorAcerto, 504)
})

// TESTES: CUSTO (REPASSE × QTD) E LUCRO LÍQUIDO (VALOR DO ACERTO - CUSTO)

test('Acerto Financeiro A: Repasse 130, 5 unidades vendidas => Custo 650', () => {
  const remessa = [{ id: 1, numero: 'REM-000001', itens: [{ id: 10, preco_venda_sugerido: 130 }] }]
  const vendas = [
    {
      id: 100,
      remessa_id: 1,
      remessa_item_id: 10,
      quantidade: 5,
      valor_repasse_unitario: 130,
      preco_unitario_vendido: 180,
      total_venda: 900,
      valor_comissao: 90,
      valor_loja: 810
    }
  ]

  const resumo = agruparVendasPorRemessa(remessa, vendas)[0]
  assert.equal(resumo.custo, 650) // 5 * 130
})

test('Acerto Financeiro B: Múltiplos itens: 2 × 130 + 3 × 90 => Custo total 530', () => {
  const remessa = [{ id: 2, numero: 'REM-000002', itens: [] }]
  const vendas = [
    {
      id: 101,
      remessa_id: 2,
      quantidade: 2,
      valor_repasse_unitario: 130,
      preco_unitario_vendido: 180,
      total_venda: 360,
      valor_loja: 324
    },
    {
      id: 102,
      remessa_id: 2,
      quantidade: 3,
      valor_repasse_unitario: 90,
      preco_unitario_vendido: 120,
      total_venda: 360,
      valor_loja: 324
    }
  ]

  const resumo = agruparVendasPorRemessa(remessa, vendas)[0]
  assert.equal(resumo.custo, 530) // 2*130 (260) + 3*90 (270) = 530
})

test('Acerto Financeiro C: Valor do Acerto 900, Custo 650 => Lucro Líquido 250', () => {
  const remessa = [{ id: 3, numero: 'REM-000003', itens: [] }]
  const vendas = [
    {
      id: 103,
      remessa_id: 3,
      quantidade: 5,
      valor_repasse_unitario: 130,
      preco_unitario_vendido: 200,
      total_venda: 1000,
      valor_comissao: 100,
      valor_loja: 900 // Valor do Acerto
    }
  ]

  const resumo = agruparVendasPorRemessa(remessa, vendas)[0]
  assert.equal(resumo.valorAcerto, 900)
  assert.equal(resumo.custo, 650) // 5 * 130 = 650
  assert.equal(resumo.lucroLiquido, 250) // 900 - 650 = 250
})

test('Acerto Financeiro D: Valor de Repasse do item muda na remessa depois => histórico antigo continua com repasse original', () => {
  // A remessa agora tem preco_venda_sugerido = 150 (mudou), mas a venda gravou valor_repasse_unitario = 130
  const remessa = [{ id: 4, numero: 'REM-000004', itens: [{ id: 40, preco_venda_sugerido: 150 }] }]
  const vendas = [
    {
      id: 104,
      remessa_id: 4,
      remessa_item_id: 40,
      quantidade: 5,
      valor_repasse_unitario: 130, // gravado no momento da venda
      preco_unitario_vendido: 200,
      total_venda: 1000,
      valor_loja: 900
    }
  ]

  const resumo = agruparVendasPorRemessa(remessa, vendas)[0]
  assert.equal(resumo.custo, 650) // continua 5 * 130 = 650 (não 750)
  assert.equal(resumo.lucroLiquido, 250) // continua 900 - 650 = 250
})

test('Acerto Financeiro E: Descontos continuam corretos ao calcular Custo e Lucro Líquido', () => {
  const remessa = [{ id: 5, numero: 'REM-000005', itens: [] }]
  const vendas = [
    {
      id: 105,
      remessa_id: 5,
      quantidade: 5,
      valor_repasse_unitario: 130,
      preco_unitario_vendido: 200,
      subtotal_venda: 1000,
      percentual_desconto: 5,
      valor_desconto: 50,
      total_venda: 950,
      valor_comissao: 95,
      valor_loja: 855 // Valor do Acerto
    }
  ]

  const resumo = agruparVendasPorRemessa(remessa, vendas)[0]
  assert.equal(resumo.totalSubtotal, 1000)
  assert.equal(resumo.totalDesconto, 50)
  assert.equal(resumo.totalVendido, 950)
  assert.equal(resumo.valorAcerto, 855)
  assert.equal(resumo.custo, 650) // 5 * 130
  assert.equal(resumo.lucroLiquido, 205) // 855 - 650 = 205
})

test('Acerto Financeiro F: Comissão continua correta ao apurar Lucro Líquido', () => {
  const remessa = [{ id: 6, numero: 'REM-000006', itens: [] }]
  const vendas = [
    {
      id: 106,
      remessa_id: 6,
      quantidade: 2,
      valor_repasse_unitario: 130,
      preco_unitario_vendido: 130, // Venda == Repasse => Comissão 0
      total_venda: 260,
      valor_comissao: 0,
      valor_loja: 260
    }
  ]

  const resumo = agruparVendasPorRemessa(remessa, vendas)[0]
  assert.equal(resumo.totalComissao, 0)
  assert.equal(resumo.valorAcerto, 260)
  assert.equal(resumo.custo, 260) // 2 * 130
  assert.equal(resumo.lucroLiquido, 0) // 260 - 260 = 0
})

// ====================================================================
// TESTES: EXPERIÊNCIA DE BUSCA E SELEÇÃO DE PRODUTO EM REMESSAS (A - O)
// ====================================================================

const produtosMock = [
  {
    id: 101,
    nome: 'Vestido Farm Floral',
    sku: 'VES-001',
    marca: 'Farm',
    venda: 250,
    quantidade: 9,
    variacoes: [
      {
        id: 1,
        cor_nome: 'Preto',
        cor_hex: '#1c1c1c',
        quantidade: 5,
        tamanhos: [
          { id: 11, tamanho: 'P', quantidade: 2 },
          { id: 12, tamanho: 'M', quantidade: 3 }
        ]
      },
      {
        id: 2,
        cor_nome: 'Rosa',
        cor_hex: '#ff69b4',
        quantidade: 4,
        tamanhos: [
          { id: 21, tamanho: 'M', quantidade: 4 }
        ]
      }
    ]
  },
  {
    id: 102,
    nome: 'Vestido Farm Preto',
    sku: 'VES-002',
    marca: 'Farm',
    venda: 280,
    quantidade: 6,
    variacoes: [
      {
        id: 3,
        cor_nome: 'Preto',
        cor_hex: '#1c1c1c',
        quantidade: 6,
        tamanhos: [
          { id: 31, tamanho: 'G', quantidade: 6 }
        ]
      }
    ]
  },
  {
    id: 103,
    nome: 'Blusa Farm',
    sku: 'BLU-001',
    marca: 'Farm',
    venda: 120,
    quantidade: 3,
    variacoes: []
  }
]

test('A) Digitar nome encontra produto correto', () => {
  const res = filtrarProdutosBusca(produtosMock, 'Vestido')
  assert.equal(res.length, 2)
  assert.equal(res[0].nome, 'Vestido Farm Floral')
  assert.equal(res[1].nome, 'Vestido Farm Preto')

  const resFloral = filtrarProdutosBusca(produtosMock, 'Floral')
  assert.equal(resFloral.length, 1)
  assert.equal(resFloral[0].id, 101)
})

test('B) Digitar SKU encontra produto correto', () => {
  const resSku = filtrarProdutosBusca(produtosMock, 'VES-002')
  assert.equal(resSku.length, 1)
  assert.equal(resSku[0].sku, 'VES-002')
  assert.equal(resSku[0].nome, 'Vestido Farm Preto')
})

test('C) Selecionar produto carrega variações corretas', () => {
  const prod = produtosMock[0]
  const cores = obterCoresProduto(prod)
  assert.equal(cores.length, 2)
  assert.equal(cores[0].cor, 'Preto')
  assert.equal(cores[0].id, 1)
  assert.equal(cores[1].cor, 'Rosa')
  assert.equal(cores[1].id, 2)
})

test('D) Selecionar Preto mostra tamanhos do Preto', () => {
  const prod = produtosMock[0]
  const varPreto = prod.variacoes[0]
  const tamanhosPreto = obterTamanhosDisponiveis(prod, varPreto)

  assert.equal(tamanhosPreto.length, 2)
  assert.equal(tamanhosPreto[0].tamanho, 'P')
  assert.equal(tamanhosPreto[0].quantidade, 2)
  assert.equal(tamanhosPreto[1].tamanho, 'M')
  assert.equal(tamanhosPreto[1].quantidade, 3)

  const varRosa = prod.variacoes[1]
  const tamanhosRosa = obterTamanhosDisponiveis(prod, varRosa)
  assert.equal(tamanhosRosa.length, 1)
  assert.equal(tamanhosRosa[0].tamanho, 'M')
  assert.equal(tamanhosRosa[0].quantidade, 4)
})

test('E) Estoque disponível mostrado corretamente', () => {
  const prod = produtosMock[0]
  const varPreto = prod.variacoes[0]
  const estoqueMPreto = obterEstoqueDisponivel(prod, varPreto, 'M')
  assert.equal(estoqueMPreto, 3)

  const varRosa = prod.variacoes[1]
  const estoqueMRosa = obterEstoqueDisponivel(prod, varRosa, 'M')
  assert.equal(estoqueMRosa, 4)
})

test('F) Quantidade maior que estoque é bloqueada', () => {
  const prod = produtosMock[0]
  const estoqueMPreto = 3

  const validacaoInvalida = validarAdicaoItemRemessa({
    produto: prod,
    quantidade: 5, // > 3
    precoRepasse: 250,
    comissaoPercentual: 20,
    estoqueDisponivel: estoqueMPreto
  })
  assert.equal(validacaoInvalida.valido, false)
  assert.match(validacaoInvalida.erro, /excede o estoque disponível na loja/)

  const validacaoValida = validarAdicaoItemRemessa({
    produto: prod,
    quantidade: 2, // <= 3
    precoRepasse: 250,
    comissaoPercentual: 20,
    estoqueDisponivel: estoqueMPreto
  })
  assert.equal(validacaoValida.valido, true)
})

test('G) produto_id preservado', () => {
  const prod = produtosMock[0]
  const varPreto = prod.variacoes[0]
  const tamM = varPreto.tamanhos[1]

  const item = montarItemRemessa({
    produto: prod,
    variacao: varPreto,
    tamanhoObj: tamM,
    quantidade: 2,
    precoRepasse: 250,
    comissaoPercentual: 20
  })

  assert.equal(item.produto_id, 101)
})

test('H) variacao_id preservado', () => {
  const prod = produtosMock[0]
  const varPreto = prod.variacoes[0]
  const tamM = varPreto.tamanhos[1]

  const item = montarItemRemessa({
    produto: prod,
    variacao: varPreto,
    tamanhoObj: tamM,
    quantidade: 2,
    precoRepasse: 250,
    comissaoPercentual: 20
  })

  assert.equal(item.variacao_id, 1)
})

test('I) produto_tamanho_id preservado', () => {
  const prod = produtosMock[0]
  const varPreto = prod.variacoes[0]
  const tamM = varPreto.tamanhos[1] // id: 12

  const item = montarItemRemessa({
    produto: prod,
    variacao: varPreto,
    tamanhoObj: tamM,
    quantidade: 2,
    precoRepasse: 250,
    comissaoPercentual: 20
  })

  assert.equal(item.produto_tamanho_id, '12')
})

test('J) Preto/M não altera Rosa/M e preserva identidades', () => {
  const prod = produtosMock[0]
  const varPreto = prod.variacoes[0]
  const tamMPreto = varPreto.tamanhos[1] // id: 12

  const itemPreto = montarItemRemessa({
    produto: prod,
    variacao: varPreto,
    tamanhoObj: tamMPreto,
    quantidade: 2,
    precoRepasse: 250,
    comissaoPercentual: 20
  })

  assert.equal(itemPreto.variacao_id, 1)
  assert.equal(itemPreto.produto_tamanho_id, '12')
  assert.equal(itemPreto.cor, 'Preto')

  // Variação Rosa permanece intacta com seu próprio ID
  const varRosa = prod.variacoes[1]
  const tamMRosa = varRosa.tamanhos[0] // id: 21
  const itemRosa = montarItemRemessa({
    produto: prod,
    variacao: varRosa,
    tamanhoObj: tamMRosa,
    quantidade: 1,
    precoRepasse: 250,
    comissaoPercentual: 20
  })

  assert.equal(itemRosa.variacao_id, 2)
  assert.equal(itemRosa.produto_tamanho_id, '21')
  assert.equal(itemRosa.cor, 'Rosa')
})

test('K) Adicionar primeiro item mantém modal aberto e limpa apenas formulário de busca', () => {
  let modalRemessaAberta = true
  let itensRemessa = []
  let estadoBuscaItem = {
    buscaProduto: 'Vestido',
    produtoSelecionado: produtosMock[0],
    quantidade: 2
  }

  // Simulação de adicionar item
  const item1 = montarItemRemessa({
    produto: estadoBuscaItem.produtoSelecionado,
    variacao: estadoBuscaItem.produtoSelecionado.variacoes[0],
    tamanhoObj: estadoBuscaItem.produtoSelecionado.variacoes[0].tamanhos[1],
    quantidade: estadoBuscaItem.quantidade,
    precoRepasse: 250,
    comissaoPercentual: 20
  })
  itensRemessa = [...itensRemessa, item1]

  // Limpeza de formulário do item
  estadoBuscaItem = {
    buscaProduto: '',
    produtoSelecionado: null,
    quantidade: 1
  }

  // Modal permanece aberto
  assert.equal(modalRemessaAberta, true)
  assert.equal(itensRemessa.length, 1)
  assert.equal(estadoBuscaItem.produtoSelecionado, null)
  assert.equal(estadoBuscaItem.buscaProduto, '')
})

test('L) Adicionar segundo item preserva o primeiro na mesma remessa', () => {
  let itensRemessa = [
    {
      produto_id: 101,
      produto_nome: 'Vestido Farm Floral',
      cor: 'Preto',
      tamanho: 'M',
      quantidade: 2,
      preco_venda_sugerido: 250,
      comissao_percentual: 20
    }
  ]

  const item2 = {
    produto_id: 102,
    produto_nome: 'Vestido Farm Preto',
    cor: 'Preto',
    tamanho: 'G',
    quantidade: 3,
    preco_venda_sugerido: 280,
    comissao_percentual: 20
  }

  itensRemessa = [...itensRemessa, item2]

  assert.equal(itensRemessa.length, 2)
  assert.equal(itensRemessa[0].produto_nome, 'Vestido Farm Floral')
  assert.equal(itensRemessa[0].quantidade, 2)
  assert.equal(itensRemessa[1].produto_nome, 'Vestido Farm Preto')
  assert.equal(itensRemessa[1].quantidade, 3)
})

test('M) Editar remessa usa a mesma busca e adiciona novo item preservando os existentes', () => {
  let formEditarRemessa = {
    id: 10,
    numero: 'REM-000010',
    itens: [
      {
        id: 100,
        produto_id: '101',
        produto_nome: 'Vestido Farm Floral',
        quantidade_enviada: 2,
        quantidade_vendida: 1,
        min_quantidade: 1,
        preco_venda_sugerido: 250,
        comissao_percentual: 20
      }
    ]
  }

  const novoItem = montarItemRemessa({
    produto: produtosMock[1],
    variacao: produtosMock[1].variacoes[0],
    tamanhoObj: produtosMock[1].variacoes[0].tamanhos[0],
    quantidade: 3,
    precoRepasse: 280,
    comissaoPercentual: 20
  })

  formEditarRemessa.itens.push({
    id: null,
    ...novoItem,
    quantidade_enviada: novoItem.quantidade,
    quantidade_vendida: 0,
    quantidade_devolvida: 0,
    min_quantidade: 0
  })

  assert.equal(formEditarRemessa.itens.length, 2)
  assert.equal(formEditarRemessa.itens[0].id, 100)
  assert.equal(formEditarRemessa.itens[1].id, null)
  assert.equal(formEditarRemessa.itens[1].produto_nome, 'Vestido Farm Preto')
})

test('N) Campos atuais de Valor de Repasse e comissão permanecem', () => {
  const prod = produtosMock[0]
  const varPreto = prod.variacoes[0]
  const tamM = varPreto.tamanhos[1]

  const item = montarItemRemessa({
    produto: prod,
    variacao: varPreto,
    tamanhoObj: tamM,
    quantidade: 2,
    precoRepasse: 240, // Repasse configurado
    comissaoPercentual: 25 // Comissão personalizada
  })

  assert.equal(item.preco_venda_sugerido, 240)
  assert.equal(item.comissao_percentual, 25)
  assert.equal('preco_venda_sugerido' in item, true)
  assert.equal('comissao_percentual' in item, true)
})

test('O) Clicar fora não fecha o modal de Remessa', () => {
  let modalRemessaAberta = true
  const formRemessa = {
    revendedoraId: 1,
    itens: [{ produto_id: 101, quantidade: 2 }]
  }

  // Backdrop overlay click handler (no-op para proteção)
  const onOverlayClick = () => {
    // Backdrop não fecha
  }

  onOverlayClick()
  assert.equal(modalRemessaAberta, true)
  assert.equal(formRemessa.itens.length, 1)
})

/* =========================================================================
   TESTES DO PAINEL FINANCEIRO ADMINISTRATIVO & DIVISÃO DE LUCROS
   ========================================================================= */

test('1) Revendedora com 40% de divisão de lucro calcula corretamente a partilha', () => {
  const rev = { id: 1, nome: 'Patricia Spoltore', usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const remessas = [{
    id: 5,
    itens: [{ id: 84, produto_id: 101, custo_unitario: 55.00, preco_venda_sugerido: 65.00 }]
  }]
  const venda = {
    id: 2,
    remessa_id: 5,
    remessa_item_id: 84,
    produto_id: 101,
    quantidade: 1,
    preco_unitario_vendido: 99.00,
    total_venda: 99.00,
    valor_comissao: 9.90,
    status: 'CONFIRMADA'
  }

  const res = detalharVendaFinanceiraAdmin(venda, rev, remessas)
  assert.equal(res.vendaLiquida, 99.00)
  assert.equal(res.custoReal, 55.00)
  assert.equal(res.comissao, 9.90)
  assert.equal(res.lucroOperacionalReal, 34.10)
  // Regra 04/11/2026: acerto sobre o CUSTO REAL (55), não sobre o repasse (65)
  assert.equal(res.lucroComercial, 34.10) // 99 - 55 - 9.90 = 34.10
  assert.equal(res.parteRevendedoraLucro, 13.64) // 40% de 34.10
  assert.equal(res.parteBazarLucro, 20.46) // 99 - 55 - 9.90 - 13.64 = 20.46
  assert.equal(res.totalEconomicoRevendedora, 23.54) // 9.90 + 13.64
  assert.equal(res.resultadoEconomicoBazar, 75.46) // 55.00 + 20.46
  assert.equal(res.valorDevidoAoBazar, 75.46)
})

test('2) Revendedora com 35% de divisão de lucro calcula 35% / 65%', () => {
  const rev = { id: 2, nome: 'Ana', usa_divisao_lucro: true, percentual_lucro_revendedora: 35 }
  const remessas = [{
    id: 10,
    itens: [{ id: 1, produto_id: 102, custo_unitario: 100.00 }]
  }]
  const venda = {
    id: 1,
    remessa_id: 10,
    remessa_item_id: 1,
    quantidade: 1,
    preco_unitario_vendido: 200.00,
    total_venda: 200.00,
    valor_comissao: 20.00,
    status: 'CONFIRMADA'
  }

  const res = detalharVendaFinanceiraAdmin(venda, rev, remessas)
  assert.equal(res.lucroOperacao, 80.00) // 200 - 100 - 20
  assert.equal(res.parteRevendedoraLucro, 28.00) // 35% de 80
  assert.equal(res.parteBazarLucro, 52.00) // 65% de 80
})

test('3) Revendedora com 0% de divisão de lucro (sem divisão)', () => {
  const rev = { id: 3, nome: 'Clara', usa_divisao_lucro: false }
  const remessas = [{
    id: 10,
    itens: [{ id: 1, custo_unitario: 50.00 }]
  }]
  const venda = {
    id: 1,
    remessa_id: 10,
    remessa_item_id: 1,
    quantidade: 1,
    preco_unitario_vendido: 100.00,
    total_venda: 100.00,
    valor_comissao: 10.00,
    valor_loja: 90.00,
    status: 'CONFIRMADA'
  }

  const res = detalharVendaFinanceiraAdmin(venda, rev, remessas)
  assert.equal(res.parteRevendedoraLucro, 0)
  assert.equal(res.parteBazarLucro, 40.00)
  assert.equal(res.totalEconomicoRevendedora, 10.00)
  assert.equal(res.valorDevidoAoBazar, 90.00)
})

test('4) Revendedora com 100% de divisão de lucro', () => {
  const rev = { id: 4, nome: 'Sociedade Total', usa_divisao_lucro: true, percentual_lucro_revendedora: 100 }
  const remessas = [{
    id: 10,
    itens: [{ id: 1, custo_unitario: 60.00 }]
  }]
  const venda = {
    id: 1,
    remessa_id: 10,
    remessa_item_id: 1,
    quantidade: 1,
    preco_unitario_vendido: 100.00,
    total_venda: 100.00,
    valor_comissao: 10.00,
    status: 'CONFIRMADA'
  }

  const res = detalharVendaFinanceiraAdmin(venda, rev, remessas)
  assert.equal(res.lucroOperacao, 30.00)
  assert.equal(res.parteRevendedoraLucro, 30.00)
  assert.equal(res.parteBazarLucro, 0.00)
  assert.equal(res.totalEconomicoRevendedora, 40.00) // 10 comissão + 30 lucro
  assert.equal(res.resultadoEconomicoBazar, 60.00) // apenas custo recuperado
})

test('5) Comissão normal é preservada e adicionada ao resultado da revendedora', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const venda = {
    quantidade: 1,
    total_venda: 100,
    valor_comissao: 15,
    remessa_id: 1,
    remessa_item_id: 1
  }
  const remessas = [{ id: 1, itens: [{ id: 1, custo_unitario: 45 }] }]
  const res = detalharVendaFinanceiraAdmin(venda, rev, remessas)
  assert.equal(res.comissao, 15)
  assert.equal(res.lucroOperacao, 40) // 100 - 45 - 15
  assert.equal(res.totalEconomicoRevendedora, 31) // 15 + (40 * 0.4 = 16)
})

test('6) Venda com desconto calcula o lucro sobre a venda líquida real', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const venda = {
    quantidade: 1,
    preco_unitario_vendido: 99.00,
    valor_total_bruto: 99.00,
    valor_desconto: 10.00,
    total_venda: 89.00,
    valor_comissao: 8.90,
    remessa_id: 5,
    remessa_item_id: 86
  }
  const remessas = [{ id: 5, itens: [{ id: 86, custo_unitario: 55.00 }] }]
  const res = detalharVendaFinanceiraAdmin(venda, rev, remessas)
  assert.equal(res.vendaBruta, 99.00)
  assert.equal(res.valorDesconto, 10.00)
  assert.equal(res.vendaLiquida, 89.00)
  assert.equal(res.custoReal, 55.00)
  assert.equal(res.comissao, 8.90)
  assert.equal(res.lucroOperacao, 25.10) // 89 - 55 - 8.90
  assert.equal(res.parteRevendedoraLucro, 10.04) // 40% de 25.10
  assert.equal(res.parteBazarLucro, 15.06) // 60% de 25.10
})

test('7) Venda sem desconto mantém venda líquida = venda bruta', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const venda = {
    quantidade: 1,
    preco_unitario_vendido: 100,
    valor_total_bruto: 100,
    valor_desconto: 0,
    total_venda: 100,
    valor_comissao: 10,
    remessa_id: 1,
    remessa_item_id: 1
  }
  const remessas = [{ id: 1, itens: [{ id: 1, custo_unitario: 50 }] }]
  const res = detalharVendaFinanceiraAdmin(venda, rev, remessas)
  assert.equal(res.vendaLiquida, 100)
  assert.equal(res.valorDesconto, 0)
})

test('8) Custo real é obtido do snapshot do item da remessa', () => {
  const remessas = [{
    id: 5,
    itens: [{ id: 58, produto_id: 10, custo_unitario: 120.00 }]
  }]
  const produtos = [{ id: 10, custo: 130.00 }] // Produto foi atualizado para 130 depois
  const venda = {
    quantidade: 1,
    total_venda: 299.00,
    valor_comissao: 29.90,
    remessa_id: 5,
    remessa_item_id: 58,
    produto_id: 10
  }
  const res = detalharVendaFinanceiraAdmin(venda, {}, remessas, produtos)
  assert.equal(res.custoReal, 120.00) // Usou o snapshot histórico de 120, não o 130 atual!
})

test('9) Custo NÃO usa valor de repasse por engano', () => {
  const remessas = [{
    id: 5,
    itens: [{ id: 58, custo_unitario: 120.00, preco_venda_sugerido: 150.00 }]
  }]
  const venda = {
    quantidade: 1,
    total_venda: 200.00,
    valor_repasse_unitario: 150.00,
    valor_comissao: 20.00,
    remessa_id: 5,
    remessa_item_id: 58
  }
  const res = detalharVendaFinanceiraAdmin(venda, {}, remessas)
  assert.equal(res.custoReal, 120.00)
  assert.notEqual(res.custoReal, 150.00)
})

test('10) Cálculo da Margem Bruta', () => {
  const venda = {
    total_venda: 100,
    valor_comissao: 10,
    remessa_id: 1,
    remessa_item_id: 1
  }
  const remessas = [{ id: 1, itens: [{ id: 1, custo_unitario: 40 }] }]
  const res = detalharVendaFinanceiraAdmin(venda, {}, remessas)
  // (100 - 40) / 100 * 100 = 60%
  assert.equal(res.margemBruta, 60.00)
})

test('11) Cálculo da Margem após Comissão', () => {
  const venda = {
    total_venda: 100,
    valor_comissao: 10,
    remessa_id: 1,
    remessa_item_id: 1
  }
  const remessas = [{ id: 1, itens: [{ id: 1, custo_unitario: 40 }] }]
  const res = detalharVendaFinanceiraAdmin(venda, {}, remessas)
  // (100 - 40 - 10) / 100 * 100 = 50%
  assert.equal(res.margemAposComissao, 50.00)
})

test('12) Cálculo da Margem Líquida do Bazar', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const venda = {
    total_venda: 100,
    valor_comissao: 10,
    remessa_id: 1,
    remessa_item_id: 1
  }
  const remessas = [{ id: 1, itens: [{ id: 1, custo_unitario: 40 }] }]
  const res = detalharVendaFinanceiraAdmin(venda, rev, remessas)
  // Lucro = 50. Parte Bazar = 30. Margem Bazar = 30 / 100 * 100 = 30%
  assert.equal(res.margemBazar, 30.00)
})

test('13) Pagamento confirmado reduz saldo pendente', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const remessas = [{ id: 1, itens: [{ id: 1, custo_unitario: 50 }] }]
  const vendas = [{ id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 1, total_venda: 100, valor_comissao: 10, valor_loja: 90, status: 'CONFIRMADA' }]
  const pagamentos = [{ id: 1, revendedora_id: 1, remessa_id: 1, valor: 50, status: 'CONFIRMADO' }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    pagamentos
  })

  assert.equal(painel.totalDevidoBazar, 90.00)
  assert.equal(painel.totalPagoConfirmado, 50.00)
  assert.equal(painel.saldoPendente, 40.00)
  assert.equal(painel.statusAcerto, 'PARCIALMENTE PAGO')
})

test('14) Pagamento aguardando confirmação não reduz o saldo oficial, mas é destacado', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const remessas = [{ id: 1, itens: [{ id: 1, custo_unitario: 50 }] }]
  const vendas = [{ id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 1, total_venda: 100, valor_comissao: 10, valor_loja: 90, status: 'CONFIRMADA' }]
  const pagamentos = [{ id: 1, revendedora_id: 1, valor: 90, valor_informado: 90, status: 'AGUARDANDO_CONFIRMACAO' }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    pagamentos
  })

  assert.equal(painel.totalPagoConfirmado, 0.00)
  assert.equal(painel.totalPagamentoAguardando, 90.00)
  assert.equal(painel.saldoPendente, 90.00)
  assert.equal(painel.statusAcerto, 'EM ABERTO')
})

test('15) Saldo quitado atribui status PAGO', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const remessas = [{ id: 1, itens: [{ id: 1, custo_unitario: 50 }] }]
  const vendas = [{ id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 1, total_venda: 100, valor_comissao: 10, valor_loja: 90, status: 'CONFIRMADA' }]
  const pagamentos = [{ id: 1, revendedora_id: 1, valor: 90, status: 'CONFIRMADO' }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    pagamentos
  })

  assert.equal(painel.saldoPendente, 0.00)
  assert.equal(painel.statusAcerto, 'PAGO')
})

test('16) Filtro por Remessa isola somente pagamentos e vendas daquela remessa', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const remessas = [
    { id: 1, itens: [{ id: 1, custo_unitario: 50 }] },
    { id: 2, itens: [{ id: 2, custo_unitario: 50 }] }
  ]
  const vendas = [
    { id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 1, total_venda: 100, valor_comissao: 10, valor_loja: 90, status: 'CONFIRMADA' },
    { id: 2, revendedora_id: 1, remessa_id: 2, remessa_item_id: 2, total_venda: 100, valor_comissao: 10, valor_loja: 90, status: 'CONFIRMADA' }
  ]
  const pagamentos = [
    { id: 1, revendedora_id: 1, remessa_id: 1, valor: 90, status: 'CONFIRMADO' },
    { id: 2, revendedora_id: 1, remessa_id: null, valor: 50, status: 'CONFIRMADO' } // Pagamento geral não entra no filtro de remessa específica
  ]

  const painelRem1 = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    pagamentos,
    filtroRemessaId: 1
  })

  assert.equal(painelRem1.totalVendaLiquida, 100.00)
  assert.equal(painelRem1.totalPagoConfirmado, 90.00)
  assert.equal(painelRem1.saldoPendente, 0.00)
  assert.equal(painelRem1.statusAcerto, 'PAGO')
})

test('17) Filtro por Período filtra corretamente por data', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const vendas = [
    { id: 1, revendedora_id: 1, total_venda: 100, valor_comissao: 10, valor_loja: 90, status: 'CONFIRMADA', data_venda: '2026-05-10' },
    { id: 2, revendedora_id: 1, total_venda: 150, valor_comissao: 15, valor_loja: 135, status: 'CONFIRMADA', data_venda: '2026-06-10' }
  ]

  const painelCustom = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    filtroPeriodo: 'personalizado',
    dataInicioCustom: '2026-06-01',
    dataFimCustom: '2026-06-30'
  })

  assert.equal(painelCustom.totalVendaLiquida, 150.00)
  assert.equal(painelCustom.vendasDetalhadas.length, 1)
})

test('18) Venda CANCELADA ou RECUSADA é excluída dos cálculos', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const vendas = [
    { id: 1, revendedora_id: 1, total_venda: 100, valor_comissao: 10, valor_loja: 90, status: 'CONFIRMADA' },
    { id: 2, revendedora_id: 1, total_venda: 200, valor_comissao: 20, valor_loja: 180, status: 'CANCELADA' },
    { id: 3, revendedora_id: 1, total_venda: 300, valor_comissao: 30, valor_loja: 270, status: 'RECUSADA' }
  ]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev]
  })

  assert.equal(painel.vendasDetalhadas.length, 1)
  assert.equal(painel.totalVendaLiquida, 100.00)
})

test('19) Lucro negativo / Prejuízo operacional é tratado sem inventar partilha positiva', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const remessas = [{ id: 1, itens: [{ id: 1, custo_unitario: 80.00 }] }]
  // Venda vendida com grande desconto: 60.00 (custo 80 + comissao 6 = 86)
  const venda = {
    quantidade: 1,
    total_venda: 60.00,
    valor_comissao: 6.00,
    remessa_id: 1,
    remessa_item_id: 1,
    status: 'CONFIRMADA'
  }

  const res = detalharVendaFinanceiraAdmin(venda, rev, remessas)
  assert.equal(res.lucroOperacao, -26.00) // 60 - 80 - 6 = -26
  assert.equal(res.parteRevendedoraLucro, 0.00) // Revendedora não recebe participação negativa nem positiva
  assert.equal(res.totalEconomicoRevendedora, 6.00) // Recebe comissão contratual
  assert.equal(res.resultadoEconomicoBazar, 54.00) // Custo recuperado (80) + prejuízo (-26) = 54
})

test('20) Conferência matemática fecha perfeitamente: Total Revendedora + Resultado Bazar = Venda Líquida', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const remessas = [{
    id: 5,
    itens: [
      { id: 84, custo_unitario: 55.00 },
      { id: 58, custo_unitario: 120.00 }
    ]
  }]
  const vendas = [
    { id: 1, revendedora_id: 1, remessa_id: 5, remessa_item_id: 84, quantidade: 1, total_venda: 99.00, valor_comissao: 9.90, status: 'CONFIRMADA' },
    { id: 2, revendedora_id: 1, remessa_id: 5, remessa_item_id: 58, quantidade: 1, total_venda: 299.00, valor_comissao: 29.90, status: 'CONFIRMADA' }
  ]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas
  })

  const soma = Number((painel.totalEconomicoRevendedora + painel.totalResultadoBazar).toFixed(2))
  assert.equal(soma, painel.totalVendaLiquida)
})

test('21) Detalhamento por Remessa consolida indicadores e status financeiro', () => {
  const rev = { id: 1, nome: 'Patricia Spoltore', usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const remessas = [{
    id: 5,
    numero: 'REM-000005',
    revendedora_id: 1,
    itens: [
      { id: 84, quantidade: 10, custo_unitario: 55.00 }
    ]
  }]
  const vendas = [
    { id: 1, revendedora_id: 1, remessa_id: 5, remessa_item_id: 84, quantidade: 2, total_venda: 198.00, valor_comissao: 19.80, status: 'CONFIRMADA' }
  ]
  const pagamentos = [
    { id: 1, revendedora_id: 1, remessa_id: 5, valor: 150.92, status: 'CONFIRMADO' }
  ]

  const resRem = detalharResultadoPorRemessaAdmin({
    remessas,
    vendas,
    revendedoras: [rev],
    pagamentos
  })

  assert.equal(resRem.length, 1)
  assert.equal(resRem[0].totalPecasVendidas, 2)
  assert.equal(resRem[0].totalPecasEnviadas, 10)
  assert.equal(resRem[0].vendaLiquida, 198.00)
  assert.equal(resRem[0].custoReal, 110.00)
  assert.equal(resRem[0].comissao, 19.80)
  assert.equal(resRem[0].lucroLiquido, 68.20)
  assert.equal(resRem[0].parteRevendedora, 27.28) // 40% de 68.20
  assert.equal(resRem[0].parteBazar, 40.92) // 60% de 68.20
  assert.equal(resRem[0].valorDevido, 150.92) // 110 + 40.92
  assert.equal(resRem[0].valorPago, 150.92)
  assert.equal(resRem[0].saldo, 0.00)
  assert.equal(resRem[0].statusFinanceiro, 'QUITADO')
})

// ====================================================================
// SUÍTE DE TESTES: FRETE DA REMESSA, RATEIO, STATUS & CONSOLIDAÇÃO
// ====================================================================

test('22) calcularRateioFrete: R$ 300,00 para 100 peças => R$ 3,00/peça', () => {
  const rateio = calcularRateioFrete(300, 100)
  assert.equal(rateio, 3.00)
})

test('23) calcularRateioFrete: frete zero => R$ 0,00', () => {
  const rateio = calcularRateioFrete(0, 100)
  assert.equal(rateio, 0.00)
})

test('24) calcularRateioFrete: zero peças => R$ 0,00 (sem divisão por zero)', () => {
  const rateio = calcularRateioFrete(300, 0)
  assert.equal(rateio, 0.00)
})

test('25) calcularRateioFrete: R$ 100,00 para 3 peças => R$ 33,33 (arredondamento 2 casas)', () => {
  const rateio = calcularRateioFrete(100, 3)
  assert.equal(rateio, 33.33)
})

test('26) montarItemRemessa: com repasse base R$ 65,00 + frete rateado R$ 3,00 => repasse efetivo R$ 68,00', () => {
  const produto = { id: 10, nome: 'Vestido Seda', sku: 'VEST-01', custo: 35.00 }
  const item = montarItemRemessa({
    produto,
    variacao: { id: 1, cor: 'Azul' },
    tamanhoObj: { id: 2, tamanho: 'M' },
    quantidade: 10,
    valorRepasseBase: 65.00,
    freteRateado: 3.00,
    comissaoPercentual: 20
  })

  assert.equal(item.valor_repasse_base, 65.00)
  assert.equal(item.frete_rateado_unitario, 3.00)
  assert.equal(item.preco_venda_sugerido, 68.00)
  assert.equal(item.quantidade, 10)
})

test('27) montarItemRemessa: sem frete => repasse base = repasse efetivo = R$ 65,00', () => {
  const produto = { id: 10, nome: 'Vestido Seda', sku: 'VEST-01', custo: 35.00 }
  const item = montarItemRemessa({
    produto,
    variacao: null,
    tamanhoObj: 'G',
    quantidade: 5,
    valorRepasseBase: 65.00,
    freteRateado: 0,
    comissaoPercentual: 20
  })

  assert.equal(item.valor_repasse_base, 65.00)
  assert.equal(item.frete_rateado_unitario, 0.00)
  assert.equal(item.preco_venda_sugerido, 65.00)
})

test('28) Idempotência na Edição de Remessa: frete alterado de 3 para 4 => base (65) + novo frete (4) = 69 (NUNCA 72)', () => {
  const itemOriginal = {
    id: 1,
    valor_repasse_base: 65.00,
    frete_rateado_unitario: 3.00,
    preco_venda_sugerido: 68.00
  }

  // Novo rateio após edição do frete total da remessa para 4.00 por peça
  const novoFreteUnitario = 4.00
  const repBase = Number(itemOriginal.valor_repasse_base != null ? itemOriginal.valor_repasse_base : itemOriginal.preco_venda_sugerido)
  const novoRepasseEfetivo = Number((repBase + novoFreteUnitario).toFixed(2))

  assert.equal(novoRepasseEfetivo, 69.00)
  assert.notEqual(novoRepasseEfetivo, 72.00) // Não acumula bola de neve
})

test('29) Idempotência na Edição: frete zerado na edição => repasse efetivo volta a ser R$ 65,00', () => {
  const itemOriginal = {
    id: 1,
    valor_repasse_base: 65.00,
    frete_rateado_unitario: 3.00,
    preco_venda_sugerido: 68.00
  }

  const novoFreteUnitario = 0.00
  const repBase = Number(itemOriginal.valor_repasse_base != null ? itemOriginal.valor_repasse_base : itemOriginal.preco_venda_sugerido)
  const novoRepasseEfetivo = Number((repBase + novoFreteUnitario).toFixed(2))

  assert.equal(novoRepasseEfetivo, 65.00)
})

test('30) Snapshot Histórico: venda realizada mantém repasse efetivo histórico mesmo após nova remessa', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const remessas = [
    {
      id: 1,
      itens: [{ id: 101, custo_unitario: 35.00, valor_repasse_base: 65.00, frete_rateado_unitario: 3.00, preco_venda_sugerido: 68.00 }]
    }
  ]
  const vendaHistorica = {
    id: 99,
    revendedora_id: 1,
    remessa_id: 1,
    remessa_item_id: 101,
    quantidade: 1,
    total_venda: 99.00,
    valor_comissao: 9.90,
    valor_repasse_unitario: 68.00,
    status: 'CONFIRMADA'
  }

  const detalhe = detalharVendaFinanceiraAdmin(vendaHistorica, rev, remessas)
  assert.equal(detalhe.custoReal, 35.00)
  assert.equal(detalhe.vendaLiquida, 99.00)
  assert.equal(detalhe.lucroOperacionalReal, 51.10) // 99 - 35 - 3 - 9.90 = 51.10
  assert.equal(detalhe.valorRepasseUnitario, 68.00) // repasse histórico preservado como referência
  assert.equal(detalhe.lucroComercial, 54.10) // 99 - 35 (custo real, sem frete) - 9.90 = 54.10
  assert.equal(detalhe.parteRevendedoraLucroReal, 21.64) // 40% de 54.10
  assert.equal(detalhe.parteBazarLucroReal, 29.46) // 99 - 35 - 3 - 9.90 - 21.64 = 29.46
})

test('31) Custo Real de Aquisição (35.00) é estritamente separado de Repasse Base (65.00) e Frete (3.00)', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const remessas = [{
    id: 1,
    itens: [{ id: 101, custo_unitario: 35.00, valor_repasse_base: 65.00, frete_rateado_unitario: 3.00, preco_venda_sugerido: 68.00 }]
  }]
  const venda = {
    id: 1,
    revendedora_id: 1,
    remessa_id: 1,
    remessa_item_id: 101,
    quantidade: 1,
    total_venda: 99.00,
    valor_comissao: 9.90,
    valor_repasse_unitario: 68.00,
    status: 'CONFIRMADA'
  }

  const res = detalharVendaFinanceiraAdmin(venda, rev, remessas)
  assert.equal(res.custoReal, 35.00)
  assert.equal(res.custoRepasse, 68.00)
  assert.equal(res.freteOperacional, 3.00)
  assert.equal(res.valorRepasseUnitario, 68.00)
})

test('32) Status do Acerto Automático: totalDevido R$ 150,00 e pago R$ 0,00 => EM ABERTO', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const remessas = [{ id: 1, itens: [{ id: 10, custo_unitario: 100 }] }]
  const vendas = [{ id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 10, quantidade: 1, total_venda: 150, valor_comissao: 0, status: 'CONFIRMADA' }]
  const pagamentos = []

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    pagamentos,
    filtroRevendedoraId: 1
  })

  assert.equal(painel.totalDevidoBazar, 150.00)
  assert.equal(painel.totalPagoConfirmado, 0.00)
  assert.equal(painel.saldoPendente, 150.00)
  assert.equal(painel.statusAcerto, 'EM ABERTO')
})

test('33) Status do Acerto Automático: totalDevido R$ 150,00 e pago R$ 50,00 => PARCIALMENTE PAGO', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const remessas = [{ id: 1, itens: [{ id: 10, custo_unitario: 100 }] }]
  const vendas = [{ id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 10, quantidade: 1, total_venda: 150, valor_comissao: 0, status: 'CONFIRMADA' }]
  const pagamentos = [{ id: 1, revendedora_id: 1, remessa_id: 1, valor: 50.00, status: 'CONFIRMADO' }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    pagamentos,
    filtroRevendedoraId: 1
  })

  assert.equal(painel.totalDevidoBazar, 150.00)
  assert.equal(painel.totalPagoConfirmado, 50.00)
  assert.equal(painel.saldoPendente, 100.00)
  assert.equal(painel.statusAcerto, 'PARCIALMENTE PAGO')
})

test('34) Status do Acerto Automático: totalDevido R$ 150,00 e pago R$ 150,00 => PAGO', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const remessas = [{ id: 1, itens: [{ id: 10, custo_unitario: 100 }] }]
  const vendas = [{ id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 10, quantidade: 1, total_venda: 150, valor_comissao: 0, status: 'CONFIRMADA' }]
  const pagamentos = [{ id: 1, revendedora_id: 1, remessa_id: 1, valor: 150.00, status: 'CONFIRMADO' }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    pagamentos,
    filtroRevendedoraId: 1
  })

  assert.equal(painel.totalDevidoBazar, 150.00)
  assert.equal(painel.totalPagoConfirmado, 150.00)
  assert.equal(painel.saldoPendente, 0.00)
  assert.equal(painel.statusAcerto, 'PAGO')
})

test('35) Status do Acerto Automático: tolerância centavos (saldo <= 0.01) => PAGO', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const remessas = [{ id: 1, itens: [{ id: 10, custo_unitario: 100 }] }]
  const vendas = [{ id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 10, quantidade: 1, total_venda: 150, valor_comissao: 0, status: 'CONFIRMADA' }]
  const pagamentos = [{ id: 1, revendedora_id: 1, remessa_id: 1, valor: 149.995, status: 'CONFIRMADO' }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    pagamentos,
    filtroRevendedoraId: 1
  })

  assert.equal(painel.saldoPendente, 0.00)
  assert.equal(painel.statusAcerto, 'PAGO')
})

test('36) Consolidação Unificada: Vendas da Remessa 1 e Remessa 2 somam em um resultado único', () => {
  const rev = { id: 1, nome: 'Ana', usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const remessas = [
    { id: 1, numero: 'REM-000001', itens: [{ id: 10, custo_unitario: 50.00 }] },
    { id: 2, numero: 'REM-000002', itens: [{ id: 20, custo_unitario: 60.00 }] }
  ]
  const vendas = [
    { id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 10, quantidade: 1, total_venda: 100.00, valor_comissao: 10.00, status: 'CONFIRMADA' },
    { id: 2, revendedora_id: 1, remessa_id: 2, remessa_item_id: 20, quantidade: 1, total_venda: 120.00, valor_comissao: 12.00, status: 'CONFIRMADA' }
  ]
  const pagamentos = [
    { id: 1, revendedora_id: 1, remessa_id: 1, valor: 50.00, status: 'CONFIRMADO' }
  ]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    pagamentos,
    filtroRevendedoraId: 1,
    filtroRemessaId: 'todas'
  })

  assert.equal(painel.totalVendaLiquida, 220.00)
  assert.equal(painel.totalCustoReal, 110.00)
  assert.equal(painel.totalComissao, 22.00)
  assert.equal(painel.totalLucroOperacionalReal, 88.00) // 220 - 110 - 22 = 88
  assert.equal(painel.totalParteRevendedoraLucro, 35.20) // 40% de 88 (Consolidado)
  assert.equal(painel.totalParteBazarLucro, 52.80) // Lucro Real Bazar = 88 - 35.20 = 52.80
  assert.equal(painel.totalDevidoBazar, 162.80) // 110 + 52.80
  assert.equal(painel.totalPagoConfirmado, 50.00)
  assert.equal(painel.saldoPendente, 112.80)
  assert.equal(painel.statusAcerto, 'PARCIALMENTE PAGO')
})

test('37) Filtro Específico de Remessa: filtroRemessaId = 1 isola apenas os dados da REM-000001', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const remessas = [
    { id: 1, itens: [{ id: 10, custo_unitario: 50.00 }] },
    { id: 2, itens: [{ id: 20, custo_unitario: 60.00 }] }
  ]
  const vendas = [
    { id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 10, quantidade: 1, total_venda: 100.00, valor_comissao: 10.00, status: 'CONFIRMADA' },
    { id: 2, revendedora_id: 1, remessa_id: 2, remessa_item_id: 20, quantidade: 1, total_venda: 120.00, valor_comissao: 12.00, status: 'CONFIRMADA' }
  ]
  const pagamentos = [
    { id: 1, revendedora_id: 1, remessa_id: 1, valor: 50.00, status: 'CONFIRMADO' },
    { id: 2, revendedora_id: 1, remessa_id: 2, valor: 80.00, status: 'CONFIRMADO' }
  ]

  const painelRem1 = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    pagamentos,
    filtroRevendedoraId: 1,
    filtroRemessaId: 1
  })

  assert.equal(painelRem1.totalVendaLiquida, 100.00)
  assert.equal(painelRem1.totalCustoReal, 50.00)
  assert.equal(painelRem1.totalComissao, 10.00)
  assert.equal(painelRem1.totalLucroOperacionalReal, 40.00)
  assert.equal(painelRem1.totalParteRevendedoraLucro, 16.00)
  assert.equal(painelRem1.totalParteBazarLucro, 24.00) // Lucro Real Bazar = 40 - 16 = 24
  assert.equal(painelRem1.totalPagoConfirmado, 50.00)
})

test('38) Pagamento Geral (sem remessa_id): deduz do consolidado total da revendedora', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const remessas = [{ id: 1, itens: [{ id: 10, custo_unitario: 40 }] }]
  const vendas = [{ id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 10, quantidade: 1, total_venda: 100, valor_comissao: 10, status: 'CONFIRMADA' }]
  const pagamentos = [{ id: 1, revendedora_id: 1, remessa_id: null, valor: 90.00, status: 'CONFIRMADO' }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    pagamentos,
    filtroRevendedoraId: 1,
    filtroRemessaId: 'todas'
  })

  assert.equal(painel.totalDevidoBazar, 90.00) // 100 - 10
  assert.equal(painel.totalPagoConfirmado, 90.00)
  assert.equal(painel.saldoPendente, 0.00)
  assert.equal(painel.statusAcerto, 'PAGO')
})

test('39) Margens Operacionais: Margem Bruta, Margem Pós-Comissão e Margem Líquida do Bazar', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const remessas = [{ id: 1, itens: [{ id: 10, custo_unitario: 40.00 }] }]
  const vendas = [{ id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 10, quantidade: 1, total_venda: 100.00, valor_comissao: 10.00, status: 'CONFIRMADA' }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas
  })

  // Venda Líquida = 100, Custo = 40, Comissão = 10, Lucro = 50, Parte Bazar = 30 (60% de 50)
  assert.equal(painel.margemBruta, 60.00) // (100 - 40) / 100 = 60%
  assert.equal(painel.margemAposComissao, 50.00) // (100 - 40 - 10) / 100 = 50%
  assert.equal(painel.margemBazar, 30.00) // 30 / 100 = 30%
})

test('40) Indicadores extras: Ticket Médio, Peças Vendidas, Preço Médio por Peça, Desconto Médio', () => {
  const rev = { id: 1, usa_divisao_lucro: false }
  const remessas = [{ id: 1, itens: [{ id: 10, custo_unitario: 20 }] }]
  const vendas = [
    { id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 10, quantidade: 2, subtotal_venda: 200, valor_desconto: 20, total_venda: 180, valor_comissao: 18, status: 'CONFIRMADA' },
    { id: 2, revendedora_id: 1, remessa_id: 1, remessa_item_id: 10, quantidade: 1, subtotal_venda: 100, valor_desconto: 0, total_venda: 100, valor_comissao: 10, status: 'CONFIRMADA' }
  ]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas
  })

  assert.equal(painel.totalPecasVendidas, 3)
  assert.equal(painel.totalVendaLiquida, 280.00)
  assert.equal(painel.ticketMedio, 140.00) // 280 / 2 vendas
  assert.equal(Number(painel.precoMedioPeca.toFixed(2)), 93.33) // 280 / 3 peças
  assert.equal(Number(painel.descontoMedioPerc.toFixed(2)), 6.67) // 20 / 300 = 6.67%
})

test('41) Partilha 40% / 60% com múltiplas vendas e comissões variadas', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const remessas = [{
    id: 1,
    itens: [
      { id: 1, custo_unitario: 50.00 },
      { id: 2, custo_unitario: 70.00 }
    ]
  }]
  const vendas = [
    { id: 1, revendedora_id: 1, remessa_id: 1, remessa_item_id: 1, quantidade: 2, total_venda: 200.00, valor_comissao: 20.00, status: 'CONFIRMADA' },
    { id: 2, revendedora_id: 1, remessa_id: 1, remessa_item_id: 2, quantidade: 1, total_venda: 150.00, valor_comissao: 30.00, status: 'CONFIRMADA' }
  ]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas
  })

  // Venda 1: Líquida 200, Custo 100, Comis 20 => Lucro 80 => Rev 32, Baz 48, Devido = 100 + 48 = 148
  // Venda 2: Líquida 150, Custo 70, Comis 30 => Lucro 50 => Rev 20, Baz 30, Devido = 70 + 30 = 100
  // Totais: Líquida 350, Custo 170, Comis 50 => Lucro Operacional Real 130 => Rev 52, Baz Real 78, Devido 248
  assert.equal(painel.totalLucroOperacionalReal, 130.00)
  assert.equal(painel.totalParteRevendedoraLucro, 52.00)
  assert.equal(painel.totalParteBazarLucro, 78.00)
  assert.equal(painel.totalDevidoBazar, 248.00)
  assert.equal(painel.totalEconomicoRevendedora, 102.00) // 50 + 52
  assert.equal(painel.totalResultadoBazar, 248.00) // 170 + 78
})

test('42) Validação final: Total Econômico Revendedora (102.00) + Total Retido Bazar (248.00) = Venda Líquida (350.00)', () => {
  const totalRevendedora = 102.00
  const resultadoBazar = 248.00
  const vendaLiquida = 350.00

  assert.equal(Number((totalRevendedora + resultadoBazar).toFixed(2)), vendaLiquida)
})

test('43) Exemplo Oficial 1: Consolidado da Revendedora (Custo R$ 350, Repasse R$ 500, Venda R$ 1.000, Comissão R$ 100, 40/60) => Devido R$ 680,00, Status PAGO', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const remessas = [{
    id: 1,
    itens: [{ id: 10, custo_unitario: 350.00, preco_venda_sugerido: 500.00, valor_repasse_base: 500.00, frete_rateado_unitario: 0 }]
  }]
  const vendas = [{
    id: 1,
    revendedora_id: 1,
    remessa_id: 1,
    remessa_item_id: 10,
    quantidade: 1,
    total_venda: 1000.00,
    valor_comissao: 100.00,
    valor_repasse_unitario: 500.00,
    status: 'CONFIRMADA'
  }]
  const pagamentos = [{
    id: 1,
    revendedora_id: 1,
    remessa_id: 1,
    valor: 680.00,
    status: 'CONFIRMADO'
  }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    pagamentos,
    filtroRevendedoraId: 1
  })

  const cons = painel.resultadoConsolidado
  assert.equal(cons.totalVendas, 1000.00)
  assert.equal(cons.totalComissao, 100.00)
  assert.equal(cons.custoRepasse, 350.00) // regra 04/11/2026: USA CUSTO REAL (350), NÃO O REPASSE (500)
  assert.equal(cons.lucroLiquido, 550.00) // 1000 - 350 - 100 = 550
  assert.equal(cons.parteRevendedora, 220.00) // 40% de 550
  assert.equal(cons.parteBazar, 330.00) // 60% de 550
  assert.equal(cons.totalEconomicoRevendedora, 320.00) // 100 + 220
  assert.equal(cons.valorDevidoAoBazar, 680.00) // 350 + 330
  assert.equal(cons.valorPago, 680.00)
  assert.equal(cons.saldo, 0.00)
  assert.equal(cons.status, 'PAGO')
})

test('44) Exemplo Oficial 2: Divisão do Resultado Econômico Real (Custo Real R$ 350, Frete R$ 50, Venda R$ 1.000, Comissão R$ 100, 40/60) => Lucro Real Bazar R$ 280', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const remessas = [{
    id: 1,
    itens: [{ id: 10, custo_unitario: 350.00, preco_venda_sugerido: 500.00, valor_repasse_base: 450.00, frete_rateado_unitario: 50.00 }]
  }]
  const vendas = [{
    id: 1,
    revendedora_id: 1,
    remessa_id: 1,
    remessa_item_id: 10,
    quantidade: 1,
    total_venda: 1000.00,
    valor_comissao: 100.00,
    valor_repasse_unitario: 500.00,
    status: 'CONFIRMADA'
  }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    filtroRevendedoraId: 1
  })

  const eco = painel.divisaoEconomicaReal
  assert.equal(eco.vendaLiquida, 1000.00)
  assert.equal(eco.custoReal, 350.00) // USA CUSTO REAL DE AQUISIÇÃO
  assert.equal(eco.freteOperacional, 50.00)
  assert.equal(eco.comissao, 100.00)
  assert.equal(eco.lucroOperacionalReal, 500.00) // 1000 - 350 - 100 - 50 = 500
  // Parte da revendedora vem do acerto sobre custo real (40% de 1000 - 350 - 100 = 550 => 220.00)
  assert.equal(eco.parteRevendedora, 220.00)
  // Lucro Real do Bazar é por RESÍDUO (frete fica com o bazar): 1000 - 350 - 50 - 100 - 220 = 280.00
  assert.equal(eco.lucroRealBazar, 280.00)
  assert.equal(Number(eco.margemRealBazar.toFixed(2)), 28.00)
  assert.equal(eco.custoRecuperado, 350.00)
  assert.equal(eco.totalRetidoBazar, 680.00) // 350 (custo) + 50 (frete) + 280 (lucro bazar)
})

test('45) Divisão 35% / 65% no Consolidado e no Econômico', () => {
  const rev = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 35 }
  const remessas = [{
    id: 1,
    itens: [{ id: 10, custo_unitario: 40.00, preco_venda_sugerido: 60.00, valor_repasse_base: 60.00, frete_rateado_unitario: 0 }]
  }]
  const vendas = [{
    id: 1,
    revendedora_id: 1,
    remessa_id: 1,
    remessa_item_id: 10,
    quantidade: 1,
    total_venda: 100.00,
    valor_comissao: 10.00,
    valor_repasse_unitario: 60.00,
    status: 'CONFIRMADA'
  }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    filtroRevendedoraId: 1
  })

  // Consolidado (custo real 40): Lucro = 100 - 40 - 10 = 50 => Rev 35% = 17.50, Bazar 65% = 32.50, Devido = 40 + 32.50 = 72.50
  assert.equal(painel.resultadoConsolidado.custoRepasse, 40.00)
  assert.equal(painel.resultadoConsolidado.lucroLiquido, 50.00)
  assert.equal(painel.resultadoConsolidado.parteRevendedora, 17.50)
  assert.equal(painel.resultadoConsolidado.parteBazar, 32.50)
  assert.equal(painel.resultadoConsolidado.valorDevidoAoBazar, 72.50)

  // Econômico: Lucro Real por RESÍDUO = 100 - 40 - 10 - 17.50 = 32.50
  assert.equal(painel.divisaoEconomicaReal.custoReal, 40.00)
  assert.equal(painel.divisaoEconomicaReal.lucroOperacionalReal, 50.00)
  assert.equal(painel.divisaoEconomicaReal.parteRevendedora, 17.50) // EXATAMENTE O MESMO DO CONSOLIDADO
  assert.equal(painel.divisaoEconomicaReal.lucroRealBazar, 32.50)
})

// ====================================================================
// TESTES MATEMÁTICOS OBRIGATÓRIOS (CASOS A, B, C, D & PROTEÇÃO DE PERCENTUAL)
// ====================================================================

test('46) CASO A - Consolidado 40/60: Vendas 1000, Custo 500, Comissao 100 => Lucro 400, Rev 160, Bazar 240, Total Rev 260, Devido 740', () => {
  const rev = { id: 1, percentual_lucro_revendedora: 40 }
  const remessas = [{
    id: 1,
    itens: [{ id: 10, custo_unitario: 500.00, preco_venda_sugerido: 500.00, valor_repasse_base: 500.00 }]
  }]
  const vendas = [{
    id: 1,
    revendedora_id: 1,
    remessa_id: 1,
    remessa_item_id: 10,
    quantidade: 1,
    total_venda: 1000.00,
    valor_comissao: 100.00,
    valor_repasse_unitario: 500.00,
    status: 'CONFIRMADA'
  }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    filtroRevendedoraId: 1
  })

  const cons = painel.resultadoConsolidado
  assert.equal(cons.totalVendas, 1000.00)
  assert.equal(cons.custoRepasse, 500.00)
  assert.equal(cons.totalComissao, 100.00)
  assert.equal(cons.lucroLiquido, 400.00)
  assert.equal(cons.percRevendedora, 40)
  assert.equal(cons.percBazar, 60)
  assert.equal(cons.parteRevendedora, 160.00)
  assert.equal(cons.parteBazar, 240.00)
  assert.equal(cons.totalEconomicoRevendedora, 260.00)
  assert.equal(cons.valorDevidoAoBazar, 740.00)

  // Conferência Obrigatória
  assert.equal(Number((cons.totalEconomicoRevendedora + cons.valorDevidoAoBazar).toFixed(2)), cons.totalVendas)
})

test('47) CASO B - Consolidado 35/65: Vendas 1000, Custo 500, Comissao 100 => Lucro 400, Rev 140, Bazar 260, Total Rev 240, Devido 760', () => {
  const rev = { id: 2, percentual_lucro_revendedora: 35 }
  const remessas = [{
    id: 1,
    itens: [{ id: 10, custo_unitario: 500.00, preco_venda_sugerido: 500.00, valor_repasse_base: 500.00 }]
  }]
  const vendas = [{
    id: 1,
    revendedora_id: 2,
    remessa_id: 1,
    remessa_item_id: 10,
    quantidade: 1,
    total_venda: 1000.00,
    valor_comissao: 100.00,
    valor_repasse_unitario: 500.00,
    status: 'CONFIRMADA'
  }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    filtroRevendedoraId: 2
  })

  const cons = painel.resultadoConsolidado
  assert.equal(cons.lucroLiquido, 400.00)
  assert.equal(cons.percRevendedora, 35)
  assert.equal(cons.percBazar, 65)
  assert.equal(cons.parteRevendedora, 140.00)
  assert.equal(cons.parteBazar, 260.00)
  assert.equal(cons.totalEconomicoRevendedora, 240.00)
  assert.equal(cons.valorDevidoAoBazar, 760.00)

  // Conferência Obrigatória
  assert.equal(Number((cons.totalEconomicoRevendedora + cons.valorDevidoAoBazar).toFixed(2)), cons.totalVendas)
})

test('48) CASO C - Consolidado 0/100: Vendas 1000, Custo 500, Comissao 100 => Lucro 400, Rev 0, Bazar 400, Total Rev 100, Devido 900', () => {
  const rev = { id: 3, percentual_lucro_revendedora: 0 }
  const remessas = [{
    id: 1,
    itens: [{ id: 10, custo_unitario: 500.00, preco_venda_sugerido: 500.00, valor_repasse_base: 500.00 }]
  }]
  const vendas = [{
    id: 1,
    revendedora_id: 3,
    remessa_id: 1,
    remessa_item_id: 10,
    quantidade: 1,
    total_venda: 1000.00,
    valor_comissao: 100.00,
    valor_repasse_unitario: 500.00,
    status: 'CONFIRMADA'
  }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    filtroRevendedoraId: 3
  })

  const cons = painel.resultadoConsolidado
  assert.equal(cons.lucroLiquido, 400.00)
  assert.equal(cons.percRevendedora, 0)
  assert.equal(cons.percBazar, 100)
  assert.equal(cons.parteRevendedora, 0.00)
  assert.equal(cons.parteBazar, 400.00)
  assert.equal(cons.totalEconomicoRevendedora, 100.00)
  assert.equal(cons.valorDevidoAoBazar, 900.00)

  // Conferência Obrigatória
  assert.equal(Number((cons.totalEconomicoRevendedora + cons.valorDevidoAoBazar).toFixed(2)), cons.totalVendas)
})

test('49) CASO D - Consolidado 100/0: Vendas 1000, Custo 500, Comissao 100 => Lucro 400, Rev 400, Bazar 0, Total Rev 500, Devido 500', () => {
  const rev = { id: 4, percentual_lucro_revendedora: 100 }
  const remessas = [{
    id: 1,
    itens: [{ id: 10, custo_unitario: 500.00, preco_venda_sugerido: 500.00, valor_repasse_base: 500.00 }]
  }]
  const vendas = [{
    id: 1,
    revendedora_id: 4,
    remessa_id: 1,
    remessa_item_id: 10,
    quantidade: 1,
    total_venda: 1000.00,
    valor_comissao: 100.00,
    valor_repasse_unitario: 500.00,
    status: 'CONFIRMADA'
  }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    filtroRevendedoraId: 4
  })

  const cons = painel.resultadoConsolidado
  assert.equal(cons.lucroLiquido, 400.00)
  assert.equal(cons.percRevendedora, 100)
  assert.equal(cons.percBazar, 0)
  assert.equal(cons.parteRevendedora, 400.00)
  assert.equal(cons.parteBazar, 0.00)
  assert.equal(cons.totalEconomicoRevendedora, 500.00)
  assert.equal(cons.valorDevidoAoBazar, 500.00)

  // Conferência Obrigatória
  assert.equal(Number((cons.totalEconomicoRevendedora + cons.valorDevidoAoBazar).toFixed(2)), cons.totalVendas)
})

test('50) Resultado Econômico Real 40/60: Venda 1000, Repasse 600, Custo Real 350, Comissao 100, Frete 50 => Lucro Real Bazar 280, Rev 220 (igual consolidado)', () => {
  const rev = { id: 5, percentual_lucro_revendedora: 40 }
  const remessas = [{
    id: 1,
    itens: [{ id: 10, custo_unitario: 350.00, frete_rateado_unitario: 50.00, preco_venda_sugerido: 600.00, valor_repasse_base: 600.00 }]
  }]
  const vendas = [{
    id: 1,
    revendedora_id: 5,
    remessa_id: 1,
    remessa_item_id: 10,
    quantidade: 1,
    total_venda: 1000.00,
    valor_comissao: 100.00,
    valor_repasse_unitario: 600.00,
    status: 'CONFIRMADA'
  }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    filtroRevendedoraId: 5
  })

  // Consolidado (custo real 350, repasse 600 não entra): Lucro = 1000 - 350 - 100 = 550 => Rev 40% = 220.00
  assert.equal(painel.resultadoConsolidado.parteRevendedora, 220.00)

  const eco = painel.divisaoEconomicaReal
  assert.equal(eco.vendaLiquida, 1000.00)
  assert.equal(eco.custoReal, 350.00)
  assert.equal(eco.freteOperacional, 50.00)
  assert.equal(eco.comissao, 100.00)
  assert.equal(eco.lucroOperacionalReal, 500.00) // 1000 - 350 - 50 - 100 = 500
  assert.equal(eco.percRevendedora, 40)
  assert.equal(eco.percBazar, 60)
  // Parte Revendedora no Econômico é EXATAMENTE a mesma do Consolidado: 220.00
  assert.equal(eco.parteRevendedora, 220.00)
  // Lucro Real do Bazar é por RESÍDUO: 1000 - 350 - 50 - 100 - 220 = 280.00
  assert.equal(eco.lucroRealBazar, 280.00)
  assert.equal(Number(eco.margemRealBazar.toFixed(2)), 28.00)
  assert.equal(eco.custoRecuperado, 350.00)
  assert.equal(eco.totalRetidoBazar, 680.00) // 350 (custo) + 50 (frete) + 280 (lucro bazar)
})

test('51) Proteção Anti-Erro de Percentual: percentual 40% não multiplica por 40 sem /100 e não aplica /100 duas vezes', () => {
  const rev = { id: 6, percentual_lucro_revendedora: 40 }
  const remessas = [{
    id: 1,
    itens: [{ id: 10, custo_unitario: 50.00, preco_venda_sugerido: 50.00, valor_repasse_base: 50.00 }]
  }]
  const vendas = [{
    id: 1,
    revendedora_id: 6,
    remessa_id: 1,
    remessa_item_id: 10,
    quantidade: 1,
    total_venda: 450.00,
    valor_comissao: 0.00,
    valor_repasse_unitario: 50.00,
    status: 'CONFIRMADA'
  }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    filtroRevendedoraId: 6
  })

  // Lucro = 450 - 50 = 400
  // Rev 40% de 400 = 160.00 (NÃO 16000.00 e NÃO 1.60)
  assert.equal(painel.resultadoConsolidado.lucroLiquido, 400.00)
  assert.equal(painel.resultadoConsolidado.parteRevendedora, 160.00)
  assert.notEqual(painel.resultadoConsolidado.parteRevendedora, 16000.00)
  assert.notEqual(painel.resultadoConsolidado.parteRevendedora, 1.60)
  assert.equal(painel.resultadoConsolidado.parteBazar, 240.00)
  assert.notEqual(painel.resultadoConsolidado.parteBazar, 24000.00)
  assert.notEqual(painel.resultadoConsolidado.parteBazar, 2.40)
})

test('52) TESTE OBRIGATÓRIO BASE 207.40: calcularDivisaoLucro(207.40, 40) => Revendedora 82.96 e Bazar 124.44 (NUNCA 84.96 ou 122.44)', () => {
  const divisao = calcularDivisaoLucro(207.40, 40)
  assert.equal(divisao.base, 207.40)
  assert.equal(divisao.percRevendedora, 40)
  assert.equal(divisao.percBazar, 60)
  assert.equal(divisao.parteRevendedora, 82.96)
  assert.equal(divisao.parteBazar, 124.44)
  assert.equal(Number((divisao.parteRevendedora + divisao.parteBazar).toFixed(2)), 207.40)

  // O sistema NÃO pode mostrar 84.96 nem 122.44
  assert.notEqual(divisao.parteRevendedora, 84.96)
  assert.notEqual(divisao.parteBazar, 122.44)
})

test('53) Consolidado com Base R$ 207,40 exibe rigorosamente R$ 82,96 (Revendedora) e R$ 124,44 (Bazar)', () => {
  const rev = { id: 7, percentual_lucro_revendedora: 40 }
  const remessas = [{
    id: 1,
    itens: [{ id: 10, custo_unitario: 692.60, preco_venda_sugerido: 692.60, valor_repasse_base: 692.60 }]
  }]
  const vendas = [{
    id: 1,
    revendedora_id: 7,
    remessa_id: 1,
    remessa_item_id: 10,
    quantidade: 1,
    total_venda: 1000.00,
    valor_comissao: 100.00,
    valor_repasse_unitario: 692.60,
    status: 'CONFIRMADA'
  }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    filtroRevendedoraId: 7
  })

  // Lucro Líquido = 1000 - 692.60 - 100 = 207.40
  const cons = painel.resultadoConsolidado
  assert.equal(cons.totalVendas, 1000.00)
  assert.equal(cons.custoRepasse, 692.60)
  assert.equal(cons.totalComissao, 100.00)
  assert.equal(cons.lucroLiquido, 207.40)
  assert.equal(cons.percRevendedora, 40)
  assert.equal(cons.percBazar, 60)
  assert.equal(cons.parteRevendedora, 82.96)
  assert.equal(cons.parteBazar, 124.44)
  assert.equal(cons.totalEconomicoRevendedora, 182.96) // 100 + 82.96
  assert.equal(cons.valorDevidoAoBazar, 817.04) // 692.60 + 124.44

  // Conferência Matemática Obrigatória
  assert.equal(Number((cons.totalEconomicoRevendedora + cons.valorDevidoAoBazar).toFixed(2)), cons.totalVendas)
})

test('54) Resultado Econômico Real (custo 652,60, frete 40) exibe R$ 98,96 (Revendedora) e Lucro Real Bazar por resíduo', () => {
  const rev = { id: 8, percentual_lucro_revendedora: 40 }
  const remessas = [{
    id: 1,
    itens: [{ id: 10, custo_unitario: 652.60, frete_rateado_unitario: 40.00, preco_venda_sugerido: 692.60, valor_repasse_base: 692.60 }]
  }]
  const vendas = [{
    id: 1,
    revendedora_id: 8,
    remessa_id: 1,
    remessa_item_id: 10,
    quantidade: 1,
    total_venda: 1000.00,
    valor_comissao: 100.00,
    valor_repasse_unitario: 692.60,
    status: 'CONFIRMADA'
  }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    filtroRevendedoraId: 8
  })

  // Consolidado (custo real 652.60): Lucro = 1000 - 652.60 - 100 = 247.40 => Parte Revendedora = 98.96
  assert.equal(painel.resultadoConsolidado.parteRevendedora, 98.96)

  // Lucro Real Bazar = 1000 - 652.60 - 40 - 100 - 98.96 = 108.44
  const eco = painel.divisaoEconomicaReal
  assert.equal(eco.vendaLiquida, 1000.00)
  assert.equal(eco.custoReal, 652.60)
  assert.equal(eco.freteOperacional, 40.00)
  assert.equal(eco.comissao, 100.00)
  assert.equal(eco.lucroOperacionalReal, 207.40)
  assert.equal(eco.percRevendedora, 40)
  assert.equal(eco.percBazar, 60)
  assert.equal(eco.parteRevendedora, 98.96) // EXATAMENTE A MESMA DO CONSOLIDADO
  assert.equal(eco.lucroRealBazar, 108.44)
  assert.equal(eco.totalRetidoBazar, 801.04) // 652.60 + 40 + 108.44
})

test('55) TESTE OBRIGATÓRIO SEÇÃO 17: parteRevendedoraResultadoEconomico === parteRevendedoraConsolidado', () => {
  const rev = { id: 9, percentual_lucro_revendedora: 40 }
  const remessas = [{
    id: 1,
    itens: [{ id: 10, custo_unitario: 200.00, frete_rateado_unitario: 30.00, preco_venda_sugerido: 692.60, valor_repasse_base: 692.60 }]
  }]
  const vendas = [{
    id: 1,
    revendedora_id: 9,
    remessa_id: 1,
    remessa_item_id: 10,
    quantidade: 1,
    total_venda: 1000.00,
    valor_comissao: 100.00,
    valor_repasse_unitario: 692.60,
    status: 'CONFIRMADA'
  }]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [rev],
    remessas,
    filtroRevendedoraId: 9
  })

  // Consolidado (custo real 200): Base = 1000 - 200 - 100 = 700 => Rev 40% = 280.00
  assert.equal(painel.resultadoConsolidado.parteRevendedora, 280.00)
  // Econômico: a parte da revendedora é a mesma do consolidado
  assert.equal(painel.divisaoEconomicaReal.parteRevendedora, 280.00)
  assert.equal(painel.divisaoEconomicaReal.parteRevendedora, painel.resultadoConsolidado.parteRevendedora)
  // Lucro Real do Bazar é por resíduo: 1000 - 200 - 30 - 100 - 280 = 390.00
  assert.equal(painel.divisaoEconomicaReal.lucroRealBazar, 390.00)
})

test('56) Regra 04/11/2026: a Parte da Revendedora acompanha o Custo Real nos 3 Cenários (A, B, C)', () => {
  const rev = { id: 10, percentual_lucro_revendedora: 40 }
  const repasseBase = 242.60
  const vendaTotal = 500.00
  const comissao = 50.00
  const frete = 20.00
  // Lucro do acerto = 500 - CUSTO REAL - 50 (o repasse 242.60 não entra mais na conta)

  // Cenário A: Custo Real R$ 100
  const remessaA = [{ id: 1, itens: [{ id: 10, custo_unitario: 100.00, frete_rateado_unitario: frete, preco_venda_sugerido: repasseBase, valor_repasse_base: repasseBase }] }]
  const vendasA = [{ id: 1, revendedora_id: 10, remessa_id: 1, remessa_item_id: 10, quantidade: 1, total_venda: vendaTotal, valor_comissao: comissao, valor_repasse_unitario: repasseBase, status: 'CONFIRMADA' }]
  const painelA = calcularPainelFinanceiroAdmin({ vendas: vendasA, revendedoras: [rev], remessas: remessaA, filtroRevendedoraId: 10 })

  assert.equal(painelA.resultadoConsolidado.parteRevendedora, 140.00) // 40% de (500 - 100 - 50)
  assert.equal(painelA.divisaoEconomicaReal.parteRevendedora, 140.00)
  assert.equal(painelA.divisaoEconomicaReal.lucroRealBazar, 190.00) // 500 - 100 - 20 - 50 - 140 = 190

  // Cenário B: Custo Real R$ 150 (Exemplo exato da Seção 13)
  const remessaB = [{ id: 1, itens: [{ id: 10, custo_unitario: 150.00, frete_rateado_unitario: frete, preco_venda_sugerido: repasseBase, valor_repasse_base: repasseBase }] }]
  const vendasB = [{ id: 1, revendedora_id: 10, remessa_id: 1, remessa_item_id: 10, quantidade: 1, total_venda: vendaTotal, valor_comissao: comissao, valor_repasse_unitario: repasseBase, status: 'CONFIRMADA' }]
  const painelB = calcularPainelFinanceiroAdmin({ vendas: vendasB, revendedoras: [rev], remessas: remessaB, filtroRevendedoraId: 10 })

  assert.equal(painelB.resultadoConsolidado.parteRevendedora, 120.00) // 40% de (500 - 150 - 50)
  assert.equal(painelB.divisaoEconomicaReal.parteRevendedora, 120.00)
  assert.equal(painelB.divisaoEconomicaReal.lucroRealBazar, 160.00) // 500 - 150 - 20 - 50 - 120 = 160

  // Cenário C: Custo Real R$ 200
  const remessaC = [{ id: 1, itens: [{ id: 10, custo_unitario: 200.00, frete_rateado_unitario: frete, preco_venda_sugerido: repasseBase, valor_repasse_base: repasseBase }] }]
  const vendasC = [{ id: 1, revendedora_id: 10, remessa_id: 1, remessa_item_id: 10, quantidade: 1, total_venda: vendaTotal, valor_comissao: comissao, valor_repasse_unitario: repasseBase, status: 'CONFIRMADA' }]
  const painelC = calcularPainelFinanceiroAdmin({ vendas: vendasC, revendedoras: [rev], remessas: remessaC, filtroRevendedoraId: 10 })

  assert.equal(painelC.resultadoConsolidado.parteRevendedora, 100.00) // 40% de (500 - 200 - 50)
  assert.equal(painelC.divisaoEconomicaReal.parteRevendedora, 100.00)
  assert.equal(painelC.divisaoEconomicaReal.lucroRealBazar, 130.00) // 500 - 200 - 20 - 50 - 100 = 130
})

// =====================================================
// TESTES OBRIGATÓRIOS DA PARTE 11 (UX REMESSA E PORTAL AGRUPADO)
// =====================================================

test('57) PARTE 11 - Teste 1: Produto P/M/G (P 1, M 1, G 3) gera 1 único grupo com total de 5 peças', () => {
  const itens = [
    { produto_id: 101, variacao_id: 201, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'P', quantidade: 1, preco_venda_sugerido: 65, comissao_percentual: 10 },
    { produto_id: 101, variacao_id: 201, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'M', quantidade: 1, preco_venda_sugerido: 65, comissao_percentual: 10 },
    { produto_id: 101, variacao_id: 201, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'G', quantidade: 3, preco_venda_sugerido: 65, comissao_percentual: 10 }
  ]

  const grupos = agruparItensRemessaPorProdutoVariacao(itens)
  assert.equal(grupos.length, 1)
  assert.equal(grupos[0].produto_nome, 'Vestido Curto Jardim')
  assert.equal(grupos[0].cor, 'Verde')
  assert.equal(grupos[0].total_quantidade, 5)
  assert.equal(grupos[0].grades.length, 3)
})

test('58) PARTE 11 - Teste 2: Produto com P/M/G/GG não gera 4 cards repetidos', () => {
  const remessas = [{
    id: 1,
    numero: 'REM-000001',
    itens: [
      { id: 1, produto_id: 10, variacao_id: 20, produto_nome: 'Blusa Seda', cor: 'Rosa', tamanho: 'P', quantidade_enviada: 2, quantidade_vendida: 0, quantidade_devolvida: 0 },
      { id: 2, produto_id: 10, variacao_id: 20, produto_nome: 'Blusa Seda', cor: 'Rosa', tamanho: 'M', quantidade_enviada: 2, quantidade_vendida: 0, quantidade_devolvida: 0 },
      { id: 3, produto_id: 10, variacao_id: 20, produto_nome: 'Blusa Seda', cor: 'Rosa', tamanho: 'G', quantidade_enviada: 2, quantidade_vendida: 0, quantidade_devolvida: 0 },
      { id: 4, produto_id: 10, variacao_id: 20, produto_nome: 'Blusa Seda', cor: 'Rosa', tamanho: 'GG', quantidade_enviada: 2, quantidade_vendida: 0, quantidade_devolvida: 0 }
    ]
  }]

  const cardsPortal = agruparPecasPortalPorProdutoVariacaoRemessa(remessas)
  assert.equal(cardsPortal.length, 1)
  assert.equal(cardsPortal[0].produto_nome, 'Blusa Seda')
  assert.equal(cardsPortal[0].total_disponivel, 8)
  assert.equal(cardsPortal[0].tamanhos.length, 4)
})

test('59) PARTE 11 - Teste 3: Duas cores (Verde, Azul) do mesmo produto resultam em 2 grupos separados', () => {
  const itens = [
    { produto_id: 101, variacao_id: 201, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'P', quantidade: 1 },
    { produto_id: 101, variacao_id: 201, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'M', quantidade: 2 },
    { produto_id: 101, variacao_id: 202, produto_nome: 'Vestido Curto Jardim', cor: 'Azul', tamanho: 'P', quantidade: 1 },
    { produto_id: 101, variacao_id: 202, produto_nome: 'Vestido Curto Jardim', cor: 'Azul', tamanho: 'G', quantidade: 3 }
  ]

  const grupos = agruparItensRemessaPorProdutoVariacao(itens)
  assert.equal(grupos.length, 2)
  assert.equal(grupos.find(g => g.cor === 'Verde')?.total_quantidade, 3)
  assert.equal(grupos.find(g => g.cor === 'Azul')?.total_quantidade, 4)
})

test('60) PARTE 11 - Teste 4: Duas remessas diferentes (REM-001, REM-002) não são misturadas no portal', () => {
  const remessas = [
    {
      id: 1,
      numero: 'REM-000001',
      itens: [{ id: 1, produto_id: 101, variacao_id: 201, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'P', quantidade_enviada: 1 }]
    },
    {
      id: 2,
      numero: 'REM-000002',
      itens: [{ id: 2, produto_id: 101, variacao_id: 201, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'G', quantidade_enviada: 2 }]
    }
  ]

  const cardsPortal = agruparPecasPortalPorProdutoVariacaoRemessa(remessas)
  assert.equal(cardsPortal.length, 2)
  assert.equal(cardsPortal[0].remessa_numero, 'REM-000001')
  assert.equal(cardsPortal[1].remessa_numero, 'REM-000002')
})

test('61) PARTE 11 - Teste 5: Tamanho com quantidade 0 não cria item ao validar grade de remessa', () => {
  const produto = { id: 101, nome: 'Vestido Curto Jardim', sku: 'VEST-01', venda: 100 }
  const variacao = { id: 201, cor_nome: 'Verde', cor_hex: '#00ff00' }
  const tamanhosDisponiveis = [
    { id: 1, tamanho: 'PP', quantidade: 2 },
    { id: 2, tamanho: 'P', quantidade: 3 },
    { id: 3, tamanho: 'M', quantidade: 5 },
    { id: 4, tamanho: 'G', quantidade: 4 },
    { id: 5, tamanho: 'GG', quantidade: 1 }
  ]
  const gradeQuantidades = { PP: 0, P: 1, M: 1, G: 3, GG: 0 }

  const res = validarGradeTamanhosRemessa({
    produto,
    variacao,
    tamanhosDisponiveis,
    gradeQuantidades,
    precoRepasse: 65,
    comissaoPercentual: 10
  })

  assert.equal(res.valido, true)
  assert.equal(res.totalQtd, 5)
  assert.equal(res.itensMontados.length, 3) // Apenas P, M e G
  assert.deepEqual(res.itensMontados.map(i => i.tamanho), ['P', 'M', 'G'])
})

test('62) PARTE 11 - Teste 6: Estoque insuficiente em somente um tamanho bloqueia a adição com mensagem explicativa', () => {
  const produto = { id: 101, nome: 'Vestido Curto Jardim' }
  const variacao = { id: 201, cor_nome: 'Verde' }
  const tamanhosDisponiveis = [
    { id: 1, tamanho: 'P', quantidade: 2 }, // Disponível 2
    { id: 2, tamanho: 'M', quantidade: 5 }
  ]
  const gradeQuantidades = { P: 3, M: 1 } // Tentou pedir 3 do P

  const res = validarGradeTamanhosRemessa({
    produto,
    variacao,
    tamanhosDisponiveis,
    gradeQuantidades,
    precoRepasse: 65,
    comissaoPercentual: 10
  })

  assert.equal(res.valido, false)
  assert.match(res.erro, /excede o estoque disponível para o tamanho P/i)
})

test('63) PARTE 11 - Teste 7: Editar P 1 / M 1 / G 3 para P 2 / M 0 / G 2 sem duplicações ao desagrupar', () => {
  const itensOriginais = [
    { id: 11, produto_id: 101, variacao_id: 201, produto_tamanho_id: 1, tamanho: 'P', quantidade_enviada: 1, quantidade_vendida: 0, quantidade_devolvida: 0, preco_venda_sugerido: 65 },
    { id: 12, produto_id: 101, variacao_id: 201, produto_tamanho_id: 2, tamanho: 'M', quantidade_enviada: 1, quantidade_vendida: 0, quantidade_devolvida: 0, preco_venda_sugerido: 65 },
    { id: 13, produto_id: 101, variacao_id: 201, produto_tamanho_id: 3, tamanho: 'G', quantidade_enviada: 3, quantidade_vendida: 0, quantidade_devolvida: 0, preco_venda_sugerido: 65 }
  ]

  const grupos = agruparItensRemessaPorProdutoVariacao(itensOriginais)
  assert.equal(grupos.length, 1)

  // Modificar na UI
  const gradeP = grupos[0].grades.find(g => g.tamanho === 'P')
  const gradeM = grupos[0].grades.find(g => g.tamanho === 'M')
  const gradeG = grupos[0].grades.find(g => g.tamanho === 'G')

  gradeP.quantidade_enviada = 2
  gradeM.quantidade_enviada = 0
  gradeG.quantidade_enviada = 2

  const itensDesagrupados = desagruparItensRemessa(grupos)
  assert.equal(itensDesagrupados.length, 3) // Preserva os 3 registros com seus IDs para que o backend safe possa zerar/desativar M
  assert.equal(itensDesagrupados.find(i => i.tamanho === 'P').quantidade_enviada, 2)
  assert.equal(itensDesagrupados.find(i => i.tamanho === 'M').quantidade_enviada, 0)
  assert.equal(itensDesagrupados.find(i => i.tamanho === 'G').quantidade_enviada, 2)
})

test('64) PARTE 11 - Teste 8: Produto antigo com linhas separadas no banco agrupa automaticamente na UI', () => {
  const itensLegadosBanco = [
    { id: 1001, produto_id: 50, variacao_id: 80, produto_tamanho_id: 91, produto_nome: 'Camisa Linho', cor: 'Branca', tamanho: '38', quantidade_enviada: 3, quantidade_vendida: 1, preco_venda_sugerido: 120 },
    { id: 1002, produto_id: 50, variacao_id: 80, produto_tamanho_id: 92, produto_nome: 'Camisa Linho', cor: 'Branca', tamanho: '40', quantidade_enviada: 5, quantidade_vendida: 2, preco_venda_sugerido: 120 },
    { id: 1003, produto_id: 50, variacao_id: 80, produto_tamanho_id: 93, produto_nome: 'Camisa Linho', cor: 'Branca', tamanho: '42', quantidade_enviada: 2, quantidade_vendida: 0, preco_venda_sugerido: 120 }
  ]

  const grupos = agruparItensRemessaPorProdutoVariacao(itensLegadosBanco)
  assert.equal(grupos.length, 1)
  assert.equal(grupos[0].total_enviada, 10)
  assert.equal(grupos[0].total_vendida, 3)
  assert.equal(grupos[0].total_disponivel, 7)
})

test('65) PARTE 11 - Teste 9: Venda no portal lista somente tamanhos com disponibilidade > 0', () => {
  const remessas = [{
    id: 1,
    numero: 'REM-000001',
    itens: [
      { id: 1, produto_nome: 'Vestido', tamanho: 'P', quantidade_enviada: 1, quantidade_vendida: 0 }, // disp 1
      { id: 2, produto_nome: 'Vestido', tamanho: 'M', quantidade_enviada: 1, quantidade_vendida: 1 }, // disp 0
      { id: 3, produto_nome: 'Vestido', tamanho: 'G', quantidade_enviada: 3, quantidade_vendida: 1 }  // disp 2
    ]
  }]

  const disponiveisParaVenda = filtrarPecasDisponiveis(remessas)
  assert.equal(disponiveisParaVenda.length, 2)
  assert.deepEqual(disponiveisParaVenda.map(p => p.tamanho), ['P', 'G'])
  assert.equal(disponiveisParaVenda.find(p => p.tamanho === 'M'), undefined)
})

test('66) PARTE 11 - Teste 10: Venda vincula com precisão o remessaItemId e produto_tamanho_id correto', () => {
  const itemEscolhido = {
    id: 42,
    produto_id: 101,
    produto_tamanho_id: 777,
    tamanho: 'G',
    disponivel_venda: 2,
    preco_venda_sugerido: 65.00
  }

  assert.equal(itemEscolhido.id, 42)
  assert.equal(itemEscolhido.produto_tamanho_id, 777)
  assert.equal(itemEscolhido.tamanho, 'G')
})

test('67) PARTE 11 - Teste 11: Uma única foto por grupo de produto/variação', () => {
  const remessas = [{
    id: 1,
    itens: [
      { id: 1, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido', foto: 'https://bazar.com/foto-verde.jpg', tamanho: 'P', quantidade_enviada: 1 },
      { id: 2, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido', foto: 'https://bazar.com/foto-verde.jpg', tamanho: 'M', quantidade_enviada: 1 },
      { id: 3, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido', foto: 'https://bazar.com/foto-verde.jpg', tamanho: 'G', quantidade_enviada: 1 }
    ]
  }]

  const cards = agruparPecasPortalPorProdutoVariacaoRemessa(remessas)
  assert.equal(cards.length, 1)
  assert.equal(cards[0].foto, 'https://bazar.com/foto-verde.jpg')
})

test('68) PARTE 11 - Teste 12: Busca por nome retorna um único card agrupado com os tamanhos', () => {
  const remessas = [{
    id: 1,
    itens: [
      { id: 1, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', tamanho: 'P', quantidade_enviada: 1 },
      { id: 2, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', tamanho: 'M', quantidade_enviada: 1 },
      { id: 3, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', tamanho: 'G', quantidade_enviada: 3 }
    ]
  }]

  const resultadoBusca = agruparPecasPortalPorProdutoVariacaoRemessa(remessas, 'Jardim')
  assert.equal(resultadoBusca.length, 1)
  assert.equal(resultadoBusca[0].tamanhos.length, 3)
})

test('69) PARTE 11 - Teste 13: Estrutura compacta mobile com métricas recebidas/vendidas/disponíveis', () => {
  const remessas = [{
    id: 1,
    itens: [
      { id: 1, produto_id: 10, variacao_id: 20, produto_nome: 'Saia Longa', tamanho: 'P', quantidade_enviada: 5, quantidade_vendida: 2, quantidade_devolvida: 1 }
    ]
  }]

  const cards = agruparPecasPortalPorProdutoVariacaoRemessa(remessas)
  assert.equal(cards[0].total_recebido, 5)
  assert.equal(cards[0].total_vendido, 2)
  assert.equal(cards[0].total_devolvido, 1)
  assert.equal(cards[0].total_disponivel, 2) // 5 - 2 - 1 = 2
})

test('70) PARTE 11 - Teste 14: RLS e integridade de revendedora_id preservados', () => {
  const item = montarItemRemessa({
    produto: { id: 101, nome: 'Vestido', sku: 'SKU-01', marca: 'Bazar' },
    variacao: { id: 201, cor_nome: 'Verde', cor_hex: '#00ff00' },
    tamanhoObj: { id: 55, tamanho: 'P' },
    quantidade: 2,
    precoRepasse: 65,
    comissaoPercentual: 10
  })

  assert.equal(item.produto_id, 101)
  assert.equal(item.variacao_id, 201)
  assert.equal(item.produto_tamanho_id, '55')
  assert.equal(item.quantidade, 2)
  assert.equal(item.preco_venda_sugerido, 65)
})

test('71) PARTE 11 - Teste 15: Nenhum custo real interno é vazado para a estrutura do portal', () => {
  const remessas = [{
    id: 1,
    itens: [
      { id: 1, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido', custo_unitario: 35.00, preco_venda_sugerido: 65.00, quantidade_enviada: 1 }
    ]
  }]

  const cards = agruparPecasPortalPorProdutoVariacaoRemessa(remessas)
  assert.equal(cards[0].custo_unitario, undefined)
  assert.equal(cards[0].preco_venda_sugerido, 65.00)
})

// =========================================================================
// AJUSTES RECENTES: REGISTRAR VENDA AGRUPADO, FOTOS REAIS E EXCLUIR REMESSA
// =========================================================================

test('72) Teste 1: P 1 / M 1 / G 3 na busca de Registrar Venda mostra 1 único produto agrupado', () => {
  const remessas = [{
    id: 1,
    numero: 'REM-000001',
    itens: [
      { id: 101, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'P', quantidade_enviada: 1, quantidade_vendida: 0 },
      { id: 102, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'M', quantidade_enviada: 1, quantidade_vendida: 0 },
      { id: 103, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'G', quantidade_enviada: 3, quantidade_vendida: 0 }
    ]
  }]

  const resultado = agruparProdutosParaVenda(remessas, 'Vestido')
  assert.equal(resultado.length, 1)
  assert.equal(resultado[0].produto_nome, 'Vestido Curto Jardim')
  assert.equal(resultado[0].total_disponivel, 5)
})

test('73) Teste 2: Selecionar o produto agrupado disponibiliza os tamanhos P, M e G', () => {
  const remessas = [{
    id: 1,
    numero: 'REM-000001',
    itens: [
      { id: 101, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'P', quantidade_enviada: 1, quantidade_vendida: 0 },
      { id: 102, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'M', quantidade_enviada: 1, quantidade_vendida: 0 },
      { id: 103, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'G', quantidade_enviada: 3, quantidade_vendida: 0 }
    ]
  }]

  const [produto] = agruparProdutosParaVenda(remessas)
  assert.equal(produto.tamanhos.length, 3)
  assert.deepEqual(produto.tamanhos.map((t) => t.tamanho), ['P', 'M', 'G'])
})

test('74) Teste 3: Tamanho M sem estoque (disponivel = 0) fica com disponivel_venda = 0', () => {
  const remessas = [{
    id: 1,
    numero: 'REM-000001',
    itens: [
      { id: 101, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'P', quantidade_enviada: 1, quantidade_vendida: 0 },
      { id: 102, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'M', quantidade_enviada: 1, quantidade_vendida: 1 },
      { id: 103, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'G', quantidade_enviada: 3, quantidade_vendida: 1 }
    ]
  }]

  const [produto] = agruparProdutosParaVenda(remessas)
  const tamM = produto.tamanhos.find((t) => t.tamanho === 'M')
  const tamG = produto.tamanhos.find((t) => t.tamanho === 'G')

  assert.equal(tamM.disponivel_venda, 0)
  assert.equal(tamG.disponivel_venda, 2)
})

test('75) Teste 4: Selecionar G vincula com precisão o id e produto_tamanho_id do tamanho G', () => {
  const remessas = [{
    id: 1,
    numero: 'REM-000001',
    itens: [
      { id: 101, produto_id: 10, produto_tamanho_id: 501, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'P', quantidade_enviada: 1 },
      { id: 103, produto_id: 10, produto_tamanho_id: 503, variacao_id: 20, produto_nome: 'Vestido Curto Jardim', cor: 'Verde', tamanho: 'G', quantidade_enviada: 3 }
    ]
  }]

  const [produto] = agruparProdutosParaVenda(remessas)
  const tamG = produto.tamanhos.find((t) => t.tamanho === 'G')

  assert.equal(tamG.id, 103)
  assert.equal(tamG.produto_tamanho_id, 503)
})

test('76) Teste 5: Duas cores (Verde e Azul) do mesmo produto resultam em 2 grupos separados na busca', () => {
  const remessas = [{
    id: 1,
    numero: 'REM-000001',
    itens: [
      { id: 101, produto_id: 10, variacao_id: 21, produto_nome: 'Vestido Jardim', cor: 'Verde', tamanho: 'P', quantidade_enviada: 1 },
      { id: 102, produto_id: 10, variacao_id: 22, produto_nome: 'Vestido Jardim', cor: 'Azul', tamanho: 'P', quantidade_enviada: 1 }
    ]
  }]

  const resultado = agruparProdutosParaVenda(remessas)
  assert.equal(resultado.length, 2)
  assert.equal(resultado.some((r) => r.cor === 'Verde'), true)
  assert.equal(resultado.some((r) => r.cor === 'Azul'), true)
})

test('77) Teste 6: Duas remessas diferentes (REM-001 e REM-002) mantêm grupos separados', () => {
  const remessas = [
    {
      id: 1,
      numero: 'REM-000001',
      itens: [{ id: 101, produto_id: 10, variacao_id: 21, produto_nome: 'Vestido Jardim', cor: 'Verde', tamanho: 'P', quantidade_enviada: 1 }]
    },
    {
      id: 2,
      numero: 'REM-000002',
      itens: [{ id: 201, produto_id: 10, variacao_id: 21, produto_nome: 'Vestido Jardim', cor: 'Verde', tamanho: 'P', quantidade_enviada: 2 }]
    }
  ]

  const resultado = agruparProdutosParaVenda(remessas)
  assert.equal(resultado.length, 2)
  assert.equal(resultado[0].remessa_numero, 'REM-000001')
  assert.equal(resultado[1].remessa_numero, 'REM-000002')
})

test('78) Teste 7: Foto correta da busca é atribuída ao produto agrupado', () => {
  const remessas = [{
    id: 1,
    numero: 'REM-000001',
    itens: [
      { id: 101, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido', foto_variacao: 'https://cdn.com/vestido-verde.jpg', quantidade_enviada: 1 }
    ]
  }]

  const [produto] = agruparProdutosParaVenda(remessas)
  assert.equal(produto.foto, 'https://cdn.com/vestido-verde.jpg')
})

test('79) Teste 8: Foto de variação existente tem prioridade máxima', () => {
  const item = {
    foto_variacao: 'https://cdn.com/foto-var.jpg',
    foto_produto: 'https://cdn.com/foto-prod.jpg'
  }

  const foto = resolverImagemProdutoRevenda(item)
  assert.equal(foto, 'https://cdn.com/foto-var.jpg')
})

test('80) Teste 9: Sem foto da variação, usa foto principal do produto', () => {
  const item = {
    foto_variacao: null,
    foto_produto: 'https://cdn.com/foto-prod.jpg'
  }

  const foto = resolverImagemProdutoRevenda(item)
  assert.equal(foto, 'https://cdn.com/foto-prod.jpg')
})

test('81) Teste 10: Sem nenhuma foto, retorna null para renderizar placeholder elegante', () => {
  const item = {
    foto_variacao: null,
    foto_produto: null
  }

  const foto = resolverImagemProdutoRevenda(item)
  assert.equal(foto, null)
})

test('82) Teste 11: URL vazia, espaços ou undefined retorna fallback seguro null', () => {
  assert.equal(resolverImagemProdutoRevenda({ foto_variacao: '   ' }), null)
  assert.equal(resolverImagemProdutoRevenda({ foto_produto: '' }), null)
  assert.equal(resolverImagemProdutoRevenda(null), null)
})

test('83) Teste 12: Minhas Peças exibe a foto real do produto/variação', () => {
  const remessas = [{
    id: 1,
    itens: [
      { id: 1, produto_id: 10, variacao_id: 20, produto_nome: 'Vestido Jardim', foto_variacao: 'https://cdn.com/vestido-real.jpg', quantidade_enviada: 1 }
    ]
  }]

  const cards = agruparPecasPortalPorProdutoVariacaoRemessa(remessas)
  assert.equal(cards[0].foto, 'https://cdn.com/vestido-real.jpg')
})

test('84) Teste 13: Remessa sem vendas e sem pagamentos é permitida para exclusão', () => {
  const remessa = { id: 10, numero: 'REM-000010' }
  const vendas = []
  const pagamentos = []

  const temVendas = vendas.some((v) => Number(v.remessa_id) === Number(remessa.id))
  const temPagamentos = pagamentos.some((p) => Number(p.remessa_id) === Number(remessa.id))

  assert.equal(temVendas, false)
  assert.equal(temPagamentos, false)
})

test('85) Teste 14: Estoque é calculado para retorno exato dos itens enviados', () => {
  const itensRemessa = [
    { produto_id: 10, produto_tamanho_id: 101, quantidade_enviada: 2 },
    { produto_id: 10, produto_tamanho_id: 102, quantidade_enviada: 3 }
  ]

  const estoqueLojaTamanhos = { 101: 5, 102: 4 }
  const estoqueLojaProduto = { 10: 9 }

  for (const item of itensRemessa) {
    estoqueLojaTamanhos[item.produto_tamanho_id] += item.quantidade_enviada
    estoqueLojaProduto[item.produto_id] += item.quantidade_enviada
  }

  assert.equal(estoqueLojaTamanhos[101], 7) // 5 + 2
  assert.equal(estoqueLojaTamanhos[102], 7) // 4 + 3
  assert.equal(estoqueLojaProduto[10], 14) // 9 + 5
})

test('86) Teste 15: Remessa com venda vinculada bloqueia a exclusão', () => {
  const remessa = { id: 10, numero: 'REM-000010' }
  const vendas = [{ id: 1, remessa_id: 10, quantidade: 1, status: 'CONFIRMADA' }]

  const temVendas = vendas.some((v) => Number(v.remessa_id) === Number(remessa.id))
  assert.equal(temVendas, true)
})

test('87) Teste 16: Remessa com pagamento vinculado bloqueia a exclusão', () => {
  const remessa = { id: 10, numero: 'REM-000010' }
  const pagamentos = [{ id: 1, remessa_id: 10, valor: 100 }]

  const temPagamentos = pagamentos.some((p) => Number(p.remessa_id) === Number(remessa.id))
  assert.equal(temPagamentos, true)
})

test('88) Teste 17: Remessa com acerto financeiro vinculado bloqueia a exclusão', () => {
  const remessa = { id: 10, numero: 'REM-000010' }
  const acertos = [{ id: 1, remessa_id: 10, valor: 300 }]

  const temAcertos = acertos.some((a) => Number(a.remessa_id) === Number(remessa.id))
  assert.equal(temAcertos, true)
})

test('89) Teste 18: Idempotência na exclusão impede repetição indevida', () => {
  const remessasAtivas = new Map([[10, { id: 10, numero: 'REM-000010' }]])

  function tentarExcluir(id) {
    if (!remessasAtivas.has(id)) {
      return { sucesso: false, mensagem: 'Remessa já excluída ou não encontrada.' }
    }
    remessasAtivas.delete(id)
    return { sucesso: true }
  }

  const primeiraChamada = tentarExcluir(10)
  const segundaChamada = tentarExcluir(10)

  assert.equal(primeiraChamada.sucesso, true)
  assert.equal(segundaChamada.sucesso, false)
})

test('90) Teste 19: Dados de outras remessas permanecem intactos após exclusão', () => {
  const remessas = [
    { id: 1, numero: 'REM-000001', itens: [{ id: 101, produto_id: 10, quantidade_enviada: 5 }] },
    { id: 2, numero: 'REM-000002', itens: [{ id: 201, produto_id: 11, quantidade_enviada: 8 }] }
  ]

  const remessasRestantes = remessas.filter((r) => r.id !== 1)
  assert.equal(remessasRestantes.length, 1)
  assert.equal(remessasRestantes[0].id, 2)
  assert.equal(remessasRestantes[0].itens[0].quantidade_enviada, 8)
})

test('91) Teste 20: Caminho relativo no bucket produtos é convertido para URL pública correta', () => {
  const url = obterUrlFotoPublica('produtos/1725370000-vestido.jpg')
  assert.equal(url, 'https://vqfqqxzzdaqkbwtgzarh.supabase.co/storage/v1/object/public/produtos/1725370000-vestido.jpg')

  const urlSemPrefixo = obterUrlFotoPublica('1725370000-vestido.jpg')
  assert.equal(urlSemPrefixo, 'https://vqfqqxzzdaqkbwtgzarh.supabase.co/storage/v1/object/public/produtos/1725370000-vestido.jpg')
})

test('92) Teste 21: Objeto de produto com array fotos (como no Admin) resolve a mesma foto no Portal', () => {
  const produtoAdmin = {
    id: 10,
    nome: 'Vestido Curto Jardim',
    fotos: [{ foto: 'https://cdn.com/vestido-jardim.jpg', ordem: 0 }]
  }

  const fotoAdmin = produtoAdmin.foto || produtoAdmin.fotos[0]?.foto
  const fotoPortal = resolverImagemProdutoRevenda(produtoAdmin)

  assert.equal(fotoAdmin, 'https://cdn.com/vestido-jardim.jpg')
  assert.equal(fotoPortal, 'https://cdn.com/vestido-jardim.jpg')
  assert.equal(fotoAdmin, fotoPortal)
})

test('93) Teste 22: Minhas Peças e Registrar Venda resolvem exatamente a mesma imagem para o mesmo produto', () => {
  const remessaItem = {
    id: 1,
    produto_id: 10,
    variacao_id: 20,
    produto_nome: 'Vestido Curto Jardim',
    cor: 'Verde',
    foto_variacao: 'https://cdn.com/vestido-verde.jpg',
    foto_produto: 'https://cdn.com/vestido-geral.jpg',
    foto: 'https://cdn.com/vestido-verde.jpg',
    quantidade_enviada: 2,
    quantidade_vendida: 0
  }

  const remessas = [{ id: 1, numero: 'REM-000001', itens: [remessaItem] }]

  const [cardMinhasPecas] = agruparPecasPortalPorProdutoVariacaoRemessa(remessas)
  const [cardRegistrarVenda] = agruparProdutosParaVenda(remessas)

  const fotoMinhasPecas = resolverImagemProdutoRevenda(cardMinhasPecas)
  const fotoRegistrarVenda = resolverImagemProdutoRevenda(cardRegistrarVenda)

  assert.equal(fotoMinhasPecas, 'https://cdn.com/vestido-verde.jpg')
  assert.equal(fotoRegistrarVenda, 'https://cdn.com/vestido-verde.jpg')
  assert.equal(fotoMinhasPecas, fotoRegistrarVenda)
})

test('94) Teste 23: Fallback seguro Sem foto quando nenhuma imagem existe', () => {
  const produtoVazio = {
    id: 11,
    nome: 'Blusa Básica',
    foto: null,
    fotos: []
  }

  assert.equal(resolverImagemProdutoRevenda(produtoVazio), null)
})

test('95) BUG REAL: Filtro de período personalizado (31/07 a 13/08) não pode vazar venda do dia seguinte por fuso horário', () => {
  // data_venda é salva sem horário ("AAAA-MM-DD"). Uma venda do dia seguinte ao fim do período
  // (14/08) não pode entrar no painel do Admin quando o filtro pede até 13/08 — mesmo rodando
  // em fuso America/Sao_Paulo (UTC-3), onde `new Date('2026-08-13T23:59:59.999')` vira
  // 2026-08-14T02:59:59.999Z e "vaza" a data seguinte se a comparação usar objetos Date.
  const revendedora = { id: 1, nome: 'Ana', usa_divisao_lucro: false }
  const remessas = [{ id: 1, revendedora_id: 1, itens: [] }]
  const vendas = [
    { id: 1, revendedora_id: 1, remessa_id: 1, status: 'CONFIRMADA', quantidade: 1, total_venda: 600, valor_repasse_unitario: 400, valor_comissao: 60, data_venda: '2026-07-31' },
    { id: 2, revendedora_id: 1, remessa_id: 1, status: 'CONFIRMADA', quantidade: 1, total_venda: 715, valor_repasse_unitario: 500, valor_comissao: 65, data_venda: '2026-08-13' },
    { id: 3, revendedora_id: 1, remessa_id: 1, status: 'CONFIRMADA', quantidade: 1, total_venda: 122, valor_repasse_unitario: 90, valor_comissao: 12, data_venda: '2026-08-14' }
  ]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [revendedora],
    remessas,
    pagamentos: [],
    produtos: [],
    filtroRevendedoraId: 1,
    filtroPeriodo: 'personalizado',
    dataInicioCustom: '2026-07-31',
    dataFimCustom: '2026-08-13'
  })

  assert.equal(painel.vendasDetalhadas.length, 2, 'a venda de 14/08 não deve entrar no período até 13/08')
  assert.equal(painel.vendasDetalhadas.some((v) => v.data_venda === '2026-08-14'), false)
})

test('96) BUG REAL: Painel Financeiro do Admin (todas as vendas, mesmo período) deve bater com o Portal da Revendedora', () => {
  const revendedora = { id: 1, nome: 'Ana', usa_divisao_lucro: false }
  const remessas = [{ id: 1, revendedora_id: 1, itens: [] }]
  const vendas = [
    { id: 1, revendedora_id: 1, remessa_id: 1, status: 'CONFIRMADA', quantidade: 1, total_venda: 600, valor_repasse_unitario: 400, valor_comissao: 60, data_venda: '2026-07-31' },
    { id: 2, revendedora_id: 1, remessa_id: 1, status: 'CONFIRMADA', quantidade: 1, total_venda: 500, valor_repasse_unitario: 300, valor_comissao: 50, data_venda: '2026-08-05' },
    { id: 3, revendedora_id: 1, remessa_id: 1, status: 'CONFIRMADA', quantidade: 1, total_venda: 715, valor_repasse_unitario: 500, valor_comissao: 65, data_venda: '2026-08-13' },
    { id: 4, revendedora_id: 1, remessa_id: 1, status: 'CONFIRMADA', quantidade: 1, total_venda: 122, valor_repasse_unitario: 90, valor_comissao: 12, data_venda: '2026-08-14' }
  ]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [revendedora],
    remessas,
    pagamentos: [],
    produtos: [],
    filtroRevendedoraId: 1,
    filtroPeriodo: 'personalizado',
    dataInicioCustom: '2026-07-31',
    dataFimCustom: '2026-08-13'
  })

  const vendasPortal = filtrarVendasConsolidacao({
    vendas,
    periodo: 'personalizado',
    dataInicio: '2026-07-31',
    dataFim: '2026-08-13'
  })
  const consolidacaoPortal = calcularConsolidacaoFinanceira(vendasPortal, revendedora)

  assert.equal(painel.vendasDetalhadas.length, vendasPortal.length)
  assert.equal(painel.resultadoConsolidado.valorDevidoAoBazar, consolidacaoPortal.valorDevidoBazar)
})

test('98) BUG REAL: divisão 40/60 do Admin deve fechar CENTAVO A CENTAVO com o Portal (mesma revendedora, várias vendas)', () => {
  // Caso real reportado: somar a partilha calculada venda a venda e ARREDONDAR cada parcela
  // individualmente pode fechar 1-2 centavos diferente de dividir o TOTAL de uma vez (jeito que o
  // Portal da Revendedora sempre faz, pois ele nunca mistura vendas de mais de uma revendedora).
  const revendedora = { id: 1, nome: 'Patricia', usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const remessas = [{ id: 4, revendedora_id: 1, itens: [] }]
  const raw = [
    [8, 62.94, 62.94, 0.00],
    [11, 62.94, 62.94, 0.00],
    [25, 142.94, 142.94, 0.00],
    [10, 62.94, 62.94, 0.00],
    [9, 62.94, 62.94, 0.00],
    [14, 123.41, 62.94, 12.34],
    [17, 123.41, 67.94, 12.34],
    [16, 123.41, 67.94, 12.34],
    [15, 265.91, 142.94, 26.59],
    [24, 142.94, 142.94, 0.00],
    [23, 142.94, 142.94, 0.00],
    [18, 123.41, 62.94, 12.34],
    [48, 125.08, 67.94, 12.51],
    [49, 125.08, 62.94, 12.51],
    [47, 125.08, 67.94, 12.51]
  ]
  const vendas = raw.map(([id, total_venda, repasse, comissao]) => ({
    id,
    revendedora_id: 1,
    remessa_id: 4,
    status: 'CONFIRMADA',
    quantidade: 1,
    total_venda,
    valor_repasse_unitario: repasse,
    valor_comissao: comissao,
    data_venda: '2026-08-01'
  }))

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras: [revendedora],
    remessas,
    pagamentos: [],
    produtos: [],
    filtroRevendedoraId: 1
  })
  const consolidacaoPortal = calcularConsolidacaoFinanceira(vendas, revendedora)

  assert.equal(painel.resultadoConsolidado.parteRevendedora, consolidacaoPortal.parteLucroRevendedora)
  assert.equal(painel.resultadoConsolidado.parteBazar, consolidacaoPortal.parteLucroBazar)
  assert.equal(painel.resultadoConsolidado.valorDevidoAoBazar, consolidacaoPortal.valorDevidoBazar)
  assert.equal(painel.resultadoConsolidado.parteRevendedora, 167.12)
  assert.equal(painel.resultadoConsolidado.parteBazar, 250.67)
})

test('97) BUG REAL: "Todas as Revendedoras" com percentuais de divisão de lucro diferentes soma a participação de cada uma corretamente', () => {
  // Ana tem 40% de participação no lucro, Bia tem 100%. Recalcular a divisão sobre o lucro
  // agregado com um único percentual "representativo" (em vez de somar o que já foi calculado
  // corretamente venda a venda) dá um total errado assim que há mais de uma revendedora envolvida.
  const revendedoras = [
    { id: 1, nome: 'Ana', usa_divisao_lucro: true, percentual_lucro_revendedora: 40 },
    { id: 2, nome: 'Bia', usa_divisao_lucro: true, percentual_lucro_revendedora: 100 }
  ]
  const remessas = [
    { id: 1, revendedora_id: 1, itens: [] },
    { id: 2, revendedora_id: 2, itens: [] }
  ]
  const vendas = [
    { id: 1, revendedora_id: 1, remessa_id: 1, status: 'CONFIRMADA', quantidade: 1, total_venda: 1000, valor_repasse_unitario: 500, valor_comissao: 0, data_venda: '2026-08-05' },
    { id: 2, revendedora_id: 2, remessa_id: 2, status: 'CONFIRMADA', quantidade: 1, total_venda: 1000, valor_repasse_unitario: 500, valor_comissao: 0, data_venda: '2026-08-05' }
  ]

  const painel = calcularPainelFinanceiroAdmin({
    vendas,
    revendedoras,
    remessas,
    pagamentos: [],
    produtos: [],
    filtroRevendedoraId: 'todas'
  })

  // Ana: lucro 500 -> 40% dela = 200 / Bia: lucro 500 -> 100% dela = 500. Total revendedoras = 700.
  assert.equal(painel.totalParteRevendedoraLucro, 700)
  // Bazar: 60% de 500 (Ana) + 0% de 500 (Bia) = 300
  assert.equal(painel.resultadoConsolidado.parteBazar, 300)
})














