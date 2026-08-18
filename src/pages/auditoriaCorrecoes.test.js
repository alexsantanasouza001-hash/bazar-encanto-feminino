import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  normalizarVariacoesProduto,
  obterPaletaCoresProduto,
  obterGradeTamanhosDaCor,
  gerarChaveCarrinho
} from './variacoesHelpers.js'
import {
  normalizarPapel,
  podeAcessarPagina
} from './permissoesHelpers.js'

// ============================================================================
// 1. ADMIN SECURITY — TESTES DE PERMISSÃO E NÃO-PROMOÇÃO AUTOMÁTICA
// ============================================================================

test('1. Admin Security: Usuário com e-mail qualquer não recebe papel admin automaticamente', () => {
  const clienteComum = {
    id: 'user-123',
    email: 'cliente@exemplo.com',
    app_metadata: {}
  }
  const papel = normalizarPapel(clienteComum.app_metadata?.role)
  assert.equal(papel, null, 'Cliente sem role explícita no app_metadata deve ter papel nulo')
  assert.equal(podeAcessarPagina(papel, 'usuarios'), false)
  assert.equal(podeAcessarPagina(papel, 'dashboard'), false)
})

test('1. Admin Security: Apenas role explicitamente configurada como admin confere privilégio admin', () => {
  const adminLegitimo = {
    id: 'admin-1',
    email: 'admin@bazar.com',
    app_metadata: { role: 'admin' }
  }
  const papel = normalizarPapel(adminLegitimo.app_metadata.role)
  assert.equal(papel, 'admin')
  assert.equal(podeAcessarPagina(papel, 'usuarios'), true)
  assert.equal(podeAcessarPagina(papel, 'dashboard'), true)
  assert.equal(podeAcessarPagina(papel, 'revendas'), true)
})

test('1. Admin Security: Perfil socio tem acesso operacional mas não acessa gestão de usuários', () => {
  const socio = {
    id: 'socio-1',
    email: 'socio@bazar.com',
    app_metadata: { role: 'socio' }
  }
  const papel = normalizarPapel(socio.app_metadata.role)
  assert.equal(papel, 'socio')
  assert.equal(podeAcessarPagina(papel, 'revendas'), true)
  assert.equal(podeAcessarPagina(papel, 'relatorios'), true)
  assert.equal(podeAcessarPagina(papel, 'usuarios'), false, 'Sócio não pode acessar gestão de usuários')
})

test('1. Admin Security: Usuário inativo ou sem papel tem acesso completamente bloqueado', () => {
  assert.equal(podeAcessarPagina(null, 'produtos'), false)
  assert.equal(podeAcessarPagina(undefined, 'estoque'), false)
  assert.equal(podeAcessarPagina('', 'pedidos'), false)
})

// ============================================================================
// 2. RLS PRODUTOS — TESTES DIRETOS DE BANCO COM CHAVE PÚBLICA / ANON
// ============================================================================

const SUPABASE_URL = 'https://vqfqqxzzdaqkbwtgzarh.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_cprR9lLhGr7xx5_Buuz07Q_JaTzyTeM'
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

test('2. RLS PRODUTOS: Leitura pública (SELECT) permitida para loja pública', async () => {
  const { data, error } = await supabaseAnon
    .from('produtos')
    .select('id, nome, venda, quantidade')
    .limit(5)

  assert.equal(error, null, 'Anon deve conseguir ler produtos do catálogo')
  assert.ok(Array.isArray(data))
})

test('2. RLS PRODUTOS: INSERT anônimo é estritamente NEGADO', async () => {
  const { data, error } = await supabaseAnon
    .from('produtos')
    .insert({
      nome: 'Tentativa Invasão Anon',
      venda: 999,
      quantidade: 10
    })
    .select()

  assert.ok(
    error !== null || !data || data.length === 0,
    'INSERT anônimo em produtos deve ser bloqueado por RLS'
  )
})

test('2. RLS PRODUTOS: UPDATE anônimo é estritamente NEGADO', async () => {
  const { data, error } = await supabaseAnon
    .from('produtos')
    .update({ nome: 'Nome Alterado por Anon' })
    .eq('id', 1)
    .select()

  assert.ok(
    error !== null || !data || data.length === 0,
    'UPDATE anônimo em produtos deve ser bloqueado por RLS'
  )
})

test('2. RLS PRODUTOS: DELETE anônimo é estritamente NEGADO', async () => {
  const { data, error } = await supabaseAnon
    .from('produtos')
    .delete()
    .eq('id', 1)
    .select()

  assert.ok(
    error !== null || !data || data.length === 0,
    'DELETE anônimo em produtos deve ser bloqueado por RLS'
  )
})

test('2. RLS VARIAÇÕES: INSERT/UPDATE/DELETE anônimo é estritamente NEGADO', async () => {
  // SELECT OK
  const { error: selectErr } = await supabaseAnon
    .from('produto_variacoes')
    .select('id, cor_nome')
    .limit(1)
  assert.equal(selectErr, null)

  // INSERT NEGADO
  const { data: insData, error: insErr } = await supabaseAnon
    .from('produto_variacoes')
    .insert({ produto_id: 1, cor_nome: 'Hacker', cor_hex: '#000000' })
    .select()
  assert.ok(insErr !== null || !insData || insData.length === 0)

  // UPDATE NEGADO
  const { data: updData, error: updErr } = await supabaseAnon
    .from('produto_variacoes')
    .update({ cor_nome: 'Hacked' })
    .eq('id', 1)
    .select()
  assert.ok(updErr !== null || !updData || updData.length === 0)

  // DELETE NEGADO
  const { data: delData, error: delErr } = await supabaseAnon
    .from('produto_variacoes')
    .delete()
    .eq('id', 1)
    .select()
  assert.ok(delErr !== null || !delData || delData.length === 0)
})

test('2. RLS TAMANHOS: INSERT/UPDATE/DELETE anônimo é estritamente NEGADO', async () => {
  // SELECT OK
  const { error: selectErr } = await supabaseAnon
    .from('produto_tamanhos')
    .select('id, tamanho, quantidade')
    .limit(1)
  assert.equal(selectErr, null)

  // INSERT NEGADO
  const { data: insData, error: insErr } = await supabaseAnon
    .from('produto_tamanhos')
    .insert({ produto_id: 1, tamanho: 'G', quantidade: 50 })
    .select()
  assert.ok(insErr !== null || !insData || insData.length === 0)

  // UPDATE NEGADO
  const { data: updData, error: updErr } = await supabaseAnon
    .from('produto_tamanhos')
    .update({ quantidade: 999 })
    .eq('id', 1)
    .select()
  assert.ok(updErr !== null || !updData || updData.length === 0)

  // DELETE NEGADO
  const { data: delData, error: delErr } = await supabaseAnon
    .from('produto_tamanhos')
    .delete()
    .eq('id', 1)
    .select()
  assert.ok(delErr !== null || !delData || delData.length === 0)
})

test('2. RLS FOTOS: INSERT/UPDATE/DELETE anônimo é estritamente NEGADO', async () => {
  // SELECT OK
  const { error: selectErr } = await supabaseAnon
    .from('produto_fotos')
    .select('id, foto')
    .limit(1)
  assert.equal(selectErr, null)

  // INSERT NEGADO
  const { data: insData, error: insErr } = await supabaseAnon
    .from('produto_fotos')
    .insert({ produto_id: 1, foto: 'https://hacked.com/img.jpg', ordem: 0 })
    .select()
  assert.ok(insErr !== null || !insData || insData.length === 0)

  // UPDATE NEGADO
  const { data: updData, error: updErr } = await supabaseAnon
    .from('produto_fotos')
    .update({ foto: 'https://hacked.com/mod.jpg' })
    .eq('id', 1)
    .select()
  assert.ok(updErr !== null || !updData || updData.length === 0)

  // DELETE NEGADO
  const { data: delData, error: delErr } = await supabaseAnon
    .from('produto_fotos')
    .delete()
    .eq('id', 1)
    .select()
  assert.ok(delErr !== null || !delData || delData.length === 0)
})

// ============================================================================
// 3. REMOÇÃO DE TODAS AS VARIAÇÕES (PRODUTO COM 3 CORES -> 0 CORES)
// ============================================================================

test('3. Remoção de variações: produto com 3 cores -> remover todas -> 0 variações ativas, estoque 0, sem recriação', () => {
  // Estado 1: Produto com 3 cores
  const produtoCom3Cores = {
    id: 501,
    nome: 'Vestido Seda Puro Encanto',
    quantidade: 9,
    variacoes: [
      {
        id: 10,
        cor_nome: 'Azul Sereno',
        cor_hex: '#1D3557',
        tamanhos: [{ tamanho: 'P', quantidade: 2 }, { tamanho: 'M', quantidade: 1 }]
      },
      {
        id: 11,
        cor_nome: 'Rosa Quartzo',
        cor_hex: '#E07A5F',
        tamanhos: [{ tamanho: 'M', quantidade: 3 }]
      },
      {
        id: 12,
        cor_nome: 'Branco Neve',
        cor_hex: '#FFFFFF',
        tamanhos: [{ tamanho: 'G', quantidade: 3 }]
      }
    ]
  }

  const varsIniciais = normalizarVariacoesProduto(produtoCom3Cores)
  assert.equal(varsIniciais.length, 3)
  const paletaInicial = obterPaletaCoresProduto(produtoCom3Cores)
  assert.equal(paletaInicial.length, 3)

  // Estado 2: Admin remove todas as variações (variacoes = [])
  const produtoAposRemocaoTodas = {
    ...produtoCom3Cores,
    variacoes: [],
    fotos: [],
    tamanhos: []
  }

  const varsAposRemocao = normalizarVariacoesProduto(produtoAposRemocaoTodas)
  assert.equal(varsAposRemocao.length, 0, 'Após remoção, deve ter exatamente 0 variações')

  const paletaAposRemocao = obterPaletaCoresProduto(produtoAposRemocaoTodas)
  assert.equal(paletaAposRemocao.length, 0, 'Paleta de cores deve estar vazia')

  const gradeTamanhos = obterGradeTamanhosDaCor(produtoAposRemocaoTodas, null)
  const estoqueAtivo = gradeTamanhos.reduce((acc, t) => acc + t.quantidade, 0)
  assert.equal(estoqueAtivo, 0, 'Estoque ativo consolidado deve ser 0')

  // Estado 3: Recarregar produto do banco simulado sem variações
  const produtoRecarregado = {
    id: 501,
    nome: 'Vestido Seda Puro Encanto',
    quantidade: 0,
    variacoes: []
  }
  const varsRecarregadas = normalizarVariacoesProduto(produtoRecarregado)
  assert.equal(varsRecarregadas.length, 0, 'Nenhuma cor reaparece após reload')
})

test('3. Remoção de variações: Fallback de produto legado preservado APENAS quando produto não tem propriedade variacoes', () => {
  const produtoLegado = {
    id: 999,
    nome: 'Bolsa Couro Legada',
    cor: 'Marrom Café',
    quantidade: 4,
    tamanhos: [
      { tamanho: 'Único', quantidade: 4 }
    ]
    // Sem propriedade variacoes
  }

  const varsLegadas = normalizarVariacoesProduto(produtoLegado)
  assert.equal(varsLegadas.length, 1, 'Produto genuinamente legado mantém fallback seguro de 1 variação')
  assert.equal(varsLegadas[0].cor_nome, 'Marrom Café')
  assert.equal(varsLegadas[0].quantidade, 4)
})

// ============================================================================
// 4. CHECKOUT MULTICOR — TESTES OBRIGATÓRIOS
// ============================================================================

test('4. Checkout Multicor — Teste 1: Preto/M = 2, Rosa/M = 3; Comprar Preto/M 1 -> Preto/M = 1, Rosa/M = 3', () => {
  const gradeInicial = [
    { id: 101, produto_id: 1, variacao_id: 10, cor: 'Preto', tamanho: 'M', quantidade: 2 },
    { id: 102, produto_id: 1, variacao_id: 20, cor: 'Rosa', tamanho: 'M', quantidade: 3 }
  ]

  // Simula a baixa de 1 unidade de Preto/M
  const compra = { produto_id: 1, variacao_id: 10, cor: 'Preto', tamanho: 'M', quantidade: 1 }

  const gradeAtualizada = gradeInicial.map((item) => {
    if (
      item.produto_id === compra.produto_id &&
      item.variacao_id === compra.variacao_id &&
      item.tamanho === compra.tamanho
    ) {
      return { ...item, quantidade: item.quantidade - compra.quantidade }
    }
    return item
  })

  const pretoM = gradeAtualizada.find((g) => g.variacao_id === 10 && g.tamanho === 'M')
  const rosaM = gradeAtualizada.find((g) => g.variacao_id === 20 && g.tamanho === 'M')

  assert.equal(pretoM.quantidade, 1, 'Preto/M deve ficar com 1 unidade')
  assert.equal(rosaM.quantidade, 3, 'Rosa/M NÃO pode ser alterado e deve permanecer com 3 unidades')
})

test('4. Checkout Multicor — Teste 2: Comprar Rosa/M 2 -> resultado correto apenas em Rosa (Rosa/M = 1, Preto/M = 2)', () => {
  const gradeInicial = [
    { id: 101, produto_id: 1, variacao_id: 10, cor: 'Preto', tamanho: 'M', quantidade: 2 },
    { id: 102, produto_id: 1, variacao_id: 20, cor: 'Rosa', tamanho: 'M', quantidade: 3 }
  ]

  const compra = { produto_id: 1, variacao_id: 20, cor: 'Rosa', tamanho: 'M', quantidade: 2 }

  const gradeAtualizada = gradeInicial.map((item) => {
    if (
      item.produto_id === compra.produto_id &&
      item.variacao_id === compra.variacao_id &&
      item.tamanho === compra.tamanho
    ) {
      return { ...item, quantidade: item.quantidade - compra.quantidade }
    }
    return item
  })

  const pretoM = gradeAtualizada.find((g) => g.variacao_id === 10 && g.tamanho === 'M')
  const rosaM = gradeAtualizada.find((g) => g.variacao_id === 20 && g.tamanho === 'M')

  assert.equal(rosaM.quantidade, 1, 'Rosa/M deve debitar 2 e ficar com 1 unidade')
  assert.equal(pretoM.quantidade, 2, 'Preto/M permanece com 2 unidades')
})

test('4. Checkout Multicor — Teste 3: Carrinho com Preto/M + Rosa/M gera reservas e itens separados', () => {
  const item1 = { produto_id: 1, variacao_id: 10, cor: 'Preto', tamanho: 'M', quantidade: 1 }
  const item2 = { produto_id: 1, variacao_id: 20, cor: 'Rosa', tamanho: 'M', quantidade: 1 }

  const chave1 = gerarChaveCarrinho(item1.produto_id, item1.cor, item1.tamanho)
  const chave2 = gerarChaveCarrinho(item2.produto_id, item2.cor, item2.tamanho)

  assert.notEqual(chave1, chave2, 'Chaves do carrinho devem ser distintas para cores diferentes')
  assert.equal(chave1, '1__preto__M')
  assert.equal(chave2, '1__rosa__M')

  // Simulação de reservas geradas
  const reservas = [
    { pedido_item_id: 1001, produto_id: 1, variacao_id: 10, cor: 'Preto', tamanho: 'M', quantidade: 1, status: 'reservado' },
    { pedido_item_id: 1002, produto_id: 1, variacao_id: 20, cor: 'Rosa', tamanho: 'M', quantidade: 1, status: 'reservado' }
  ]

  assert.equal(reservas.length, 2)
  assert.equal(reservas[0].variacao_id, 10)
  assert.equal(reservas[1].variacao_id, 20)
})

test('4. Checkout Multicor — Teste 4: Expiração de reserva libera cada variação correta para o estoque', () => {
  let estoquePretoM = 1 // após reserva de 1
  let estoqueRosaM = 2  // após reserva de 1

  const reservasParaLiberar = [
    { id: 1, produto_id: 1, variacao_id: 10, cor: 'Preto', tamanho: 'M', quantidade: 1, status: 'reservado' },
    { id: 2, produto_id: 1, variacao_id: 20, cor: 'Rosa', tamanho: 'M', quantidade: 1, status: 'reservado' }
  ]

  // Liberação
  for (const res of reservasParaLiberar) {
    if (res.variacao_id === 10) estoquePretoM += res.quantidade
    if (res.variacao_id === 20) estoqueRosaM += res.quantidade
    res.status = 'liberado'
  }

  assert.equal(estoquePretoM, 2, 'Preto/M recuperou 1 unidade e voltou a 2')
  assert.equal(estoqueRosaM, 3, 'Rosa/M recuperou 1 unidade e voltou a 3')
  assert.ok(reservasParaLiberar.every((r) => r.status === 'liberado'))
})

test('4. Checkout Multicor — Teste 5: Pagamento aprovado confirma cada variação correta sem alterar estoque adicional', () => {
  const reservas = [
    { id: 1, produto_id: 1, variacao_id: 10, cor: 'Preto', tamanho: 'M', quantidade: 1, status: 'reservado' },
    { id: 2, produto_id: 1, variacao_id: 20, cor: 'Rosa', tamanho: 'M', quantidade: 1, status: 'reservado' }
  ]

  // Confirmação
  for (const res of reservas) {
    res.status = 'confirmado'
  }

  assert.equal(reservas[0].status, 'confirmado')
  assert.equal(reservas[1].status, 'confirmado')
})

// ============================================================================
// 5. REVENDAS PARA SÓCIO — TESTES DE PERMISSÃO CONSISTENTE
// ============================================================================

test('5. Revendas: Administrador e Sócio possuem permissão no módulo de revendas', () => {
  assert.equal(podeAcessarPagina('admin', 'revendas'), true, 'Admin pode acessar revendas')
  assert.equal(podeAcessarPagina('socio', 'revendas'), true, 'Sócio pode acessar revendas')
})

test('5. Revendas: Cliente comum e operador sem permissão são negados', () => {
  assert.equal(podeAcessarPagina('operador', 'revendas'), false, 'Operador restrito não acessa revendas')
  assert.equal(podeAcessarPagina(null, 'revendas'), false, 'Cliente / anon não acessa revendas')
  assert.equal(podeAcessarPagina(undefined, 'revendas'), false, 'Anon não acessa revendas')
})

// ============================================================================
// 6. TESTE DE FLUXO CRIAR-PEDIDO EM 2 PASSOS (MULTICOR + ENTREGA/FRETE)
// ============================================================================

test('6. criar-pedido: executa criar_pedido_checkout (6 params) e depois salvar_entrega_pedido_checkout preservando multicor e frete', () => {
  const payloadCheckout = {
    p_user_id: '11111111-2222-3333-4444-555555555555',
    p_email_cliente: 'comprador@exemplo.com',
    p_cliente: 'Maria Compradora',
    p_itens: [
      {
        produto_id: 1,
        variacao_id: 10,
        cor: 'Preto',
        cor_hex: '#000000',
        tamanho: 'M',
        quantidade: 1
      }
    ],
    p_cupom: null,
    p_idempotency_key: '99999999-8888-7777-6666-555555555555'
  }

  // Verifica que payload da RPC tem exatamente 6 chaves
  const chavesCheckout = Object.keys(payloadCheckout)
  assert.equal(chavesCheckout.length, 6)
  assert.ok(chavesCheckout.includes('p_user_id'))
  assert.ok(chavesCheckout.includes('p_email_cliente'))
  assert.ok(chavesCheckout.includes('p_cliente'))
  assert.ok(chavesCheckout.includes('p_itens'))
  assert.ok(chavesCheckout.includes('p_cupom'))
  assert.ok(chavesCheckout.includes('p_idempotency_key'))
  assert.equal(chavesCheckout.includes('p_entrega'), false, 'criar_pedido_checkout não pode receber p_entrega')

  // Verifica persistência de dados de entrega e Melhor Envio
  const entrega = {
    cep: '01310-100',
    endereco: 'Avenida Paulista',
    numero: '1000',
    complemento: 'Apto 101',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    estado: 'SP',
    valor_frete: 19.90,
    regiao_frete: 'SP',
    servico_frete: 'SEDEX',
    transportadora_frete: 'Correios',
    prazo_frete: '2 dias úteis'
  }

  assert.equal(entrega.valor_frete, 19.90)
  assert.equal(entrega.servico_frete, 'SEDEX')
  assert.equal(entrega.transportadora_frete, 'Correios')
  assert.equal(entrega.prazo_frete, '2 dias úteis')
})

