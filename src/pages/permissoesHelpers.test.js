import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizarPapel,
  obterTituloPapel,
  podeAcessarPagina,
  podeExecutarAcao,
  obterMenuPermitido,
  MENU_ADMIN_COMPLETO
} from './permissoesHelpers.js'

test('normaliza papéis válidos e rejeita papéis inválidos', () => {
  assert.equal(normalizarPapel('admin'), 'admin')
  assert.equal(normalizarPapel('Administrador'), 'admin')
  assert.equal(normalizarPapel('socio'), 'socio')
  assert.equal(normalizarPapel('SÓCIO'), 'socio')
  assert.equal(normalizarPapel('operador'), 'operador')
  assert.equal(normalizarPapel('Operador'), 'operador')
  assert.equal(normalizarPapel('cliente'), null)
  assert.equal(normalizarPapel(''), null)
  assert.equal(normalizarPapel(null), null)
})

test('retorna título amigável do papel', () => {
  assert.equal(obterTituloPapel('admin'), 'Administrador')
  assert.equal(obterTituloPapel('socio'), 'Sócio')
  assert.equal(obterTituloPapel('operador'), 'Operador')
  assert.equal(obterTituloPapel('desconhecido'), 'Sem permissão')
})

test('ADMINISTRADOR: possui acesso total a todas as páginas do sistema', () => {
  const admin = { papel: 'admin', ativo: true }

  for (const item of MENU_ADMIN_COMPLETO) {
    assert.equal(
      podeAcessarPagina(admin, item.id),
      true,
      `Admin deve acessar a página ${item.id}`
    )
  }

  assert.equal(podeExecutarAcao(admin, 'gerenciar_usuarios'), true)
  assert.equal(podeExecutarAcao(admin, 'alterar_papel_usuario'), true)
  assert.equal(podeExecutarAcao(admin, 'desativar_usuario'), true)
  assert.equal(podeExecutarAcao(admin, 'remover_usuario'), true)
  assert.equal(podeExecutarAcao(admin, 'excluir_produto'), true)
})

test('SÓCIO: acessa operações e relatórios, mas NÃO acessa usuários nem gerencia permissões', () => {
  const socio = { papel: 'socio', ativo: true }

  // Páginas permitidas
  assert.equal(podeAcessarPagina(socio, 'dashboard'), true)
  assert.equal(podeAcessarPagina(socio, 'produtos'), true)
  assert.equal(podeAcessarPagina(socio, 'estoque'), true)
  assert.equal(podeAcessarPagina(socio, 'pedidos'), true)
  assert.equal(podeAcessarPagina(socio, 'clientes'), true)
  assert.equal(podeAcessarPagina(socio, 'revendas'), true)
  assert.equal(podeAcessarPagina(socio, 'relatorios'), true)

  // Páginas proibidas
  assert.equal(podeAcessarPagina(socio, 'usuarios'), false)

  // Ações proibidas
  assert.equal(podeExecutarAcao(socio, 'gerenciar_usuarios'), false)
  assert.equal(podeExecutarAcao(socio, 'alterar_papel_usuario'), false)
  assert.equal(podeExecutarAcao(socio, 'desativar_usuario'), false)
  assert.equal(podeExecutarAcao(socio, 'remover_usuario'), false)

  // Ações permitidas
  assert.equal(podeExecutarAcao(socio, 'excluir_produto'), true)
  assert.equal(podeExecutarAcao(socio, 'acessar_relatorios_financeiros'), true)
})

test('OPERADOR: perfil restrito aos módulos operacionais essenciais', () => {
  const operador = { papel: 'operador', ativo: true }

  // Permitidos por padrão: Dashboard, Produtos, Estoque, Pedidos
  assert.equal(podeAcessarPagina(operador, 'dashboard'), true)
  assert.equal(podeAcessarPagina(operador, 'produtos'), true)
  assert.equal(podeAcessarPagina(operador, 'estoque'), true)
  assert.equal(podeAcessarPagina(operador, 'pedidos'), true)

  // Proibidos: Clientes, Revendas, Relatórios, Usuários
  assert.equal(podeAcessarPagina(operador, 'clientes'), false)
  assert.equal(podeAcessarPagina(operador, 'revendas'), false)
  assert.equal(podeAcessarPagina(operador, 'relatorios'), false)
  assert.equal(podeAcessarPagina(operador, 'usuarios'), false)

  // Ações operacionais permitidas
  assert.equal(podeExecutarAcao(operador, 'operar_estoque'), true)
  assert.equal(podeExecutarAcao(operador, 'operar_pedidos'), true)

  // Ações críticas proibidas
  assert.equal(podeExecutarAcao(operador, 'gerenciar_usuarios'), false)
  assert.equal(podeExecutarAcao(operador, 'excluir_produto'), false)
  assert.equal(podeExecutarAcao(operador, 'acessar_relatorios_financeiros'), false)
})

test('USUÁRIO INATIVO: bloqueado completamente mesmo se tiver papel de admin', () => {
  const usuarioInativo = { papel: 'admin', ativo: false }

  assert.equal(podeAcessarPagina(usuarioInativo, 'dashboard'), false)
  assert.equal(podeAcessarPagina(usuarioInativo, 'usuarios'), false)
  assert.equal(podeAcessarPagina(usuarioInativo, 'pedidos'), false)
  assert.equal(podeExecutarAcao(usuarioInativo, 'gerenciar_usuarios'), false)
})

test('MENU POR PERFIL: monta apenas os itens permitidos para cada papel', () => {
  const menuAdmin = obterMenuPermitido('admin')
  assert.equal(menuAdmin.length, 8)
  assert.deepEqual(
    menuAdmin.map((i) => i.id),
    ['dashboard', 'produtos', 'estoque', 'pedidos', 'clientes', 'revendas', 'relatorios', 'usuarios']
  )

  const menuSocio = obterMenuPermitido('socio')
  assert.equal(menuSocio.length, 7)
  assert.deepEqual(
    menuSocio.map((i) => i.id),
    ['dashboard', 'produtos', 'estoque', 'pedidos', 'clientes', 'revendas', 'relatorios']
  )

  const menuOperador = obterMenuPermitido('operador')
  assert.equal(menuOperador.length, 4)
  assert.deepEqual(
    menuOperador.map((i) => i.id),
    ['dashboard', 'produtos', 'estoque', 'pedidos']
  )
})
