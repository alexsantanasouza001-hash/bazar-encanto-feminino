// ====================================================================
// GESTÃO DE PERMISSÕES E PERFIS ADMINISTRATIVOS
// BAZAR ENCANTO FEMININO
// ====================================================================

export const PAPEIS = {
  ADMIN: 'admin',
  SOCIO: 'socio',
  OPERADOR: 'operador'
}

export const TITULOS_PAPEIS = {
  admin: 'Administrador',
  socio: 'Sócio',
  operador: 'Operador'
}

export const PERMISSOES_PAGINAS = {
  dashboard: ['admin', 'socio', 'operador'],
  produtos: ['admin', 'socio', 'operador'],
  estoque: ['admin', 'socio', 'operador'],
  pedidos: ['admin', 'socio', 'operador'],
  clientes: ['admin', 'socio'],
  revendas: ['admin', 'socio'],
  relatorios: ['admin', 'socio'],
  usuarios: ['admin']
}

export const PERMISSOES_ACOES = {
  gerenciar_usuarios: ['admin'],
  alterar_papel_usuario: ['admin'],
  desativar_usuario: ['admin'],
  remover_usuario: ['admin'],
  excluir_produto: ['admin', 'socio'],
  acessar_relatorios_financeiros: ['admin', 'socio'],
  acessar_revendas: ['admin', 'socio'],
  operar_estoque: ['admin', 'socio', 'operador'],
  operar_pedidos: ['admin', 'socio', 'operador']
}

export const MENU_ADMIN_COMPLETO = [
  { id: 'dashboard', label: 'Dashboard', icone: '▦' },
  { id: 'produtos', label: 'Produtos', icone: '👗' },
  { id: 'estoque', label: 'Estoque', icone: '📦' },
  { id: 'pedidos', label: 'Pedidos', icone: '🛍️' },
  { id: 'clientes', label: 'Clientes', icone: '👥' },
  { id: 'revendas', label: 'Revendas', icone: '🤝' },
  { id: 'relatorios', label: 'Relatórios', icone: '📊' },
  { id: 'usuarios', label: 'Usuários & Acessos', icone: '🛡️' }
]

/**
 * Normaliza o papel do usuário.
 */
export function normalizarPapel(papel) {
  const p = String(papel || '').trim().toLowerCase()
  if (p === 'admin' || p === 'administrador') return 'admin'
  if (p === 'socio' || p === 'sócio') return 'socio'
  if (p === 'operador' || p === 'funcionario' || p === 'funcionário') return 'operador'
  return null
}

/**
 * Retorna o título legível do perfil.
 */
export function obterTituloPapel(papel) {
  const norm = normalizarPapel(papel)
  return TITULOS_PAPEIS[norm] || 'Sem permissão'
}

/**
 * Retorna a classe CSS correspondente ao badge do papel.
 */
export function obterBadgePapelClasse(papel) {
  const norm = normalizarPapel(papel)
  if (norm === 'admin') return 'papel-badge-admin'
  if (norm === 'socio') return 'papel-badge-socio'
  if (norm === 'operador') return 'papel-badge-operador'
  return 'papel-badge-invalido'
}

/**
 * Valida se um usuário pode acessar uma determinada página do admin.
 */
export function podeAcessarPagina(papelOuUsuario, paginaId) {
  if (!paginaId) return false

  let papel = null
  let ativo = true

  if (typeof papelOuUsuario === 'object' && papelOuUsuario !== null) {
    papel = papelOuUsuario.papel || papelOuUsuario.app_metadata?.role || papelOuUsuario.role
    if (papelOuUsuario.ativo === false) {
      ativo = false
    }
  } else {
    papel = papelOuUsuario
  }

  if (!ativo) return false

  const papelNorm = normalizarPapel(papel)
  if (!papelNorm) return false

  const papeisPermitidos = PERMISSOES_PAGINAS[paginaId] || []
  return papeisPermitidos.includes(papelNorm)
}

/**
 * Valida se um usuário pode executar uma determinada ação crítica.
 */
export function podeExecutarAcao(papelOuUsuario, acaoId) {
  if (!acaoId) return false

  let papel = null
  let ativo = true

  if (typeof papelOuUsuario === 'object' && papelOuUsuario !== null) {
    papel = papelOuUsuario.papel || papelOuUsuario.app_metadata?.role || papelOuUsuario.role
    if (papelOuUsuario.ativo === false) {
      ativo = false
    }
  } else {
    papel = papelOuUsuario
  }

  if (!ativo) return false

  const papelNorm = normalizarPapel(papel)
  if (!papelNorm) return false

  const papeisPermitidos = PERMISSOES_ACOES[acaoId] || []
  return papeisPermitidos.includes(papelNorm)
}

/**
 * Retorna os itens de menu permitidos para o perfil informado.
 */
export function obterMenuPermitido(papelOuUsuario) {
  return MENU_ADMIN_COMPLETO.filter((item) =>
    podeAcessarPagina(papelOuUsuario, item.id)
  )
}
