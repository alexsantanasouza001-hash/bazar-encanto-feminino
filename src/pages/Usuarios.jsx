import { useEffect, useMemo, useState } from 'react'
import './Usuarios.css'

import {
  carregarUsuariosAdmin,
  adicionarUsuarioAdmin,
  alterarPapelUsuarioAdmin,
  alterarStatusUsuarioAdmin,
  removerUsuarioAdmin,
  reenviarConviteUsuarioAdmin
} from '../storage'

import {
  obterTituloPapel,
  obterBadgePapelClasse
} from './permissoesHelpers'

function Usuarios({ usuarioLogado }) {
  const [usuarios, setUsuarios] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroPapel, setFiltroPapel] = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  // Modais
  const [mostrarModalNovo, setMostrarModalNovo] = useState(false)
  const [modalPapelUsuario, setModalPapelUsuario] = useState(null)

  // Form State
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novoPapel, setNovoPapel] = useState('socio')
  const [enviarConvite, setEnviarConvite] = useState(true)
  const [erroForm, setErroForm] = useState('')

  // =====================================================
  // CARREGAR USUÁRIOS
  // =====================================================

  async function atualizarLista() {
    try {
      setCarregando(true)
      const lista = await carregarUsuariosAdmin()
      setUsuarios(Array.isArray(lista) ? lista : [])
    } catch (erro) {
      console.error('Erro ao carregar usuários:', erro)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    atualizarLista()
  }, [])

  // =====================================================
  // MÉTRICAS
  // =====================================================

  const metricas = useMemo(() => {
    let admins = 0
    let socios = 0
    let operadores = 0
    let ativos = 0

    for (const u of usuarios) {
      if (u.ativo !== false) ativos++
      if (u.papel === 'admin') admins++
      else if (u.papel === 'socio') socios++
      else if (u.papel === 'operador') operadores++
    }

    return { admins, socios, operadores, ativos, total: usuarios.length }
  }, [usuarios])

  // =====================================================
  // FILTRAGEM
  // =====================================================

  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter((u) => {
      const termo = busca.trim().toLowerCase()
      if (termo) {
        const nome = String(u.nome || '').toLowerCase()
        const email = String(u.email || '').toLowerCase()
        if (!nome.includes(termo) && !email.includes(termo)) return false
      }

      if (filtroPapel !== 'todos' && u.papel !== filtroPapel) return false
      if (filtroStatus === 'ativos' && u.ativo === false) return false
      if (filtroStatus === 'inativos' && u.ativo !== false) return false

      return true
    })
  }, [usuarios, busca, filtroPapel, filtroStatus])

  // =====================================================
  // AÇÕES
  // =====================================================

  async function handleAdicionarUsuario(e) {
    e.preventDefault()
    setErroForm('')

    if (!novoNome.trim() || !novoEmail.trim()) {
      setErroForm('Preencha o nome completo e o e-mail.')
      return
    }

    try {
      setProcessando(true)
      const res = await adicionarUsuarioAdmin({
        nome: novoNome.trim(),
        email: novoEmail.trim(),
        papel: novoPapel,
        enviarConvite
      })

      if (res?.sucesso === false) {
        throw new Error(res.erro || 'Falha ao adicionar usuário.')
      }

      window.alert(`Usuário "${novoNome}" adicionado com sucesso!`)
      setMostrarModalNovo(false)
      setNovoNome('')
      setNovoEmail('')
      setNovoPapel('socio')
      setEnviarConvite(true)
      await atualizarLista()
    } catch (erro) {
      console.error('Erro ao adicionar usuário:', erro)
      setErroForm(erro?.message || 'Erro ao adicionar usuário.')
    } finally {
      setProcessando(false)
    }
  }

  async function handleAlterarPapel(usuarioId, papelEscolhido) {
    try {
      setProcessando(true)
      const res = await alterarPapelUsuarioAdmin(usuarioId, papelEscolhido)
      if (res?.sucesso === false) {
        throw new Error(res.erro || 'Não foi possível alterar o perfil.')
      }

      setModalPapelUsuario(null)
      await atualizarLista()
    } catch (erro) {
      console.error('Erro ao alterar perfil:', erro)
      window.alert(erro?.message || 'Erro ao alterar o perfil do usuário.')
    } finally {
      setProcessando(false)
    }
  }

  async function handleAlternarStatus(usuario) {
    const novoStatus = !usuario.ativo
    const acaoTexto = novoStatus ? 'ativar' : 'desativar'

    if (usuario.user_id === usuarioLogado?.id && !novoStatus) {
      window.alert('Você não pode desativar sua própria conta de administrador.')
      return
    }

    const confirmou = window.confirm(
      `Deseja realmente ${acaoTexto} o acesso de "${usuario.nome || usuario.email}"?`
    )
    if (!confirmou) return

    try {
      setProcessando(true)
      const res = await alterarStatusUsuarioAdmin(usuario.id, novoStatus)
      if (res?.sucesso === false) {
        throw new Error(res.erro || `Não foi possível ${acaoTexto} o usuário.`)
      }

      await atualizarLista()
    } catch (erro) {
      console.error('Erro ao alterar status:', erro)
      window.alert(erro?.message || 'Erro ao alterar o status do usuário.')
    } finally {
      setProcessando(false)
    }
  }

  async function handleRemoverUsuario(usuario) {
    if (usuario.user_id === usuarioLogado?.id) {
      window.alert('Você não pode remover sua própria conta de administrador.')
      return
    }

    const confirmou = window.confirm(
      `Atenção: Deseja realmente remover o acesso de "${usuario.nome || usuario.email}"?\n\nO usuário não conseguirá mais efetuar login no painel administrativo.`
    )
    if (!confirmou) return

    try {
      setProcessando(true)
      const res = await removerUsuarioAdmin(usuario.id)
      if (res?.sucesso === false) {
        throw new Error(res.erro || 'Não foi possível remover o usuário.')
      }

      window.alert('Acesso do usuário removido com sucesso.')
      await atualizarLista()
    } catch (erro) {
      console.error('Erro ao remover usuário:', erro)
      window.alert(erro?.message || 'Erro ao remover o usuário.')
    } finally {
      setProcessando(false)
    }
  }

  async function handleReenviarConvite(usuario) {
    const confirmou = window.confirm(
      `Deseja enviar instruções de definição/redefinição de senha para "${usuario.email}"?`
    )
    if (!confirmou) return

    try {
      setProcessando(true)
      const res = await reenviarConviteUsuarioAdmin(usuario.email)
      if (res?.sucesso === false) {
        throw new Error(res.erro || 'Não foi possível enviar o e-mail.')
      }

      window.alert(`E-mail de instruções enviado com sucesso para ${usuario.email}!`)
    } catch (erro) {
      console.error('Erro ao reenviar convite:', erro)
      window.alert(erro?.message || 'Erro ao enviar e-mail de instruções.')
    } finally {
      setProcessando(false)
    }
  }

  function formatarData(data) {
    if (!data) return 'Nunca acessou'
    const d = new Date(data)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="usuarios-page">
      {/* CABEÇALHO */}
      <div className="usuarios-header">
        <div>
          <h1>Usuários & Permissões</h1>
          <p>Gerencie quem pode acessar o painel administrativo e defina os níveis de permissão da equipe.</p>
        </div>

        <button
          type="button"
          className="btn-novo-usuario"
          onClick={() => {
            setErroForm('')
            setMostrarModalNovo(true)
          }}
        >
          <span>+</span> Adicionar usuário
        </button>
      </div>

      {/* CARDS INDICADORES */}
      <div className="usuarios-cards">
        <div className="usuario-card-metric">
          <div className="usuario-card-icon admin">👑</div>
          <div>
            <span>Administradores</span>
            <strong>{metricas.admins}</strong>
          </div>
        </div>

        <div className="usuario-card-metric">
          <div className="usuario-card-icon socio">🤝</div>
          <div>
            <span>Sócios</span>
            <strong>{metricas.socios}</strong>
          </div>
        </div>

        <div className="usuario-card-metric">
          <div className="usuario-card-icon operador">🛠️</div>
          <div>
            <span>Operadores</span>
            <strong>{metricas.operadores}</strong>
          </div>
        </div>

        <div className="usuario-card-metric">
          <div className="usuario-card-icon ativos">✅</div>
          <div>
            <span>Usuários Ativos</span>
            <strong>{metricas.ativos} / {metricas.total}</strong>
          </div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="usuarios-filtros">
        <div className="usuarios-busca">
          <span className="usuarios-busca-icon">🔎</span>
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <select
          className="usuarios-select"
          value={filtroPapel}
          onChange={(e) => setFiltroPapel(e.target.value)}
        >
          <option value="todos">Todos os perfis</option>
          <option value="admin">Apenas Administradores</option>
          <option value="socio">Apenas Sócios</option>
          <option value="operador">Apenas Operadores</option>
        </select>

        <select
          className="usuarios-select"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
        >
          <option value="todos">Todos os status</option>
          <option value="ativos">Apenas Ativos</option>
          <option value="inativos">Apenas Inativos</option>
        </select>
      </div>

      {/* TABELA */}
      <div className="usuarios-tabela-wrapper">
        <table className="usuarios-tabela">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Perfil de Acesso</th>
              <th>Status</th>
              <th>Último Acesso</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  Carregando usuários do sistema...
                </td>
              </tr>
            ) : usuariosFiltrados.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  Nenhum usuário encontrado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              usuariosFiltrados.map((u) => {
                const ehProprioUsuario = u.user_id === usuarioLogado?.id

                return (
                  <tr key={u.id}>
                    <td>
                      <div className="usuario-info-nome">
                        <strong>{u.nome || 'Sem nome'} {ehProprioUsuario && <span style={{ color: '#234b36', fontSize: '0.75rem' }}>(Você)</span>}</strong>
                        <small>{u.email}</small>
                      </div>
                    </td>

                    <td>
                      <span className={`papel-badge ${obterBadgePapelClasse(u.papel)}`}>
                        {u.papel === 'admin' ? '👑' : u.papel === 'socio' ? '🤝' : '🛠️'} {obterTituloPapel(u.papel)}
                      </span>
                    </td>

                    <td>
                      <span className={u.ativo !== false ? 'status-badge-ativo' : 'status-badge-inativo'}>
                        {u.ativo !== false ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>

                    <td>
                      <small style={{ color: '#64748b' }}>
                        {formatarData(u.ultimo_acesso)}
                      </small>
                    </td>

                    <td>
                      <div className="usuario-acoes">
                        <button
                          type="button"
                          className="btn-acao-usuario"
                          disabled={processando}
                          onClick={() => setModalPapelUsuario(u)}
                          title="Alterar perfil de acesso"
                        >
                          Alterar Perfil
                        </button>

                        <button
                          type="button"
                          className={`btn-acao-usuario ${u.ativo !== false ? 'desativar' : 'reativar'}`}
                          disabled={processando || ehProprioUsuario}
                          onClick={() => handleAlternarStatus(u)}
                          title={u.ativo !== false ? 'Desativar acesso' : 'Reativar acesso'}
                        >
                          {u.ativo !== false ? 'Desativar' : 'Ativar'}
                        </button>

                        <button
                          type="button"
                          className="btn-acao-usuario"
                          disabled={processando}
                          onClick={() => handleReenviarConvite(u)}
                          title="Enviar instruções de senha por e-mail"
                        >
                          🔑 Convite / Senha
                        </button>

                        {!ehProprioUsuario && (
                          <button
                            type="button"
                            className="btn-acao-usuario remover"
                            disabled={processando}
                            onClick={() => handleRemoverUsuario(u)}
                            title="Remover acesso permanentemente"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL ADICIONAR NOVO USUÁRIO */}
      {mostrarModalNovo && (
        <div className="modal-overlay" onClick={() => setMostrarModalNovo(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Adicionar Usuário</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setMostrarModalNovo(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdicionarUsuario}>
              <div className="modal-body">
                {erroForm && (
                  <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '0.85rem' }}>
                    {erroForm}
                  </div>
                )}

                <div className="modal-group">
                  <label htmlFor="nome-usuario">Nome completo</label>
                  <input
                    id="nome-usuario"
                    type="text"
                    placeholder="Ex: Maria da Silva"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    required
                  />
                </div>

                <div className="modal-group">
                  <label htmlFor="email-usuario">E-mail corporativo / pessoal</label>
                  <input
                    id="email-usuario"
                    type="email"
                    placeholder="Ex: maria@bazar.com"
                    value={novoEmail}
                    onChange={(e) => setNovoEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="modal-group">
                  <label htmlFor="papel-usuario">Perfil de Acesso</label>
                  <select
                    id="papel-usuario"
                    value={novoPapel}
                    onChange={(e) => setNovoPapel(e.target.value)}
                  >
                    <option value="socio">🤝 Sócio (Operação + Relatórios completos)</option>
                    <option value="operador">🛠️ Operador (Produtos, Estoque e Pedidos)</option>
                    <option value="admin">👑 Administrador (Acesso total + Gestão de Usuários)</option>
                  </select>

                  <div className="modal-role-info">
                    {novoPapel === 'admin' && (
                      <span><strong>Administrador:</strong> Acesso irrestrito a todos os módulos, configurações e permissão para adicionar e gerenciar outros usuários.</span>
                    )}
                    {novoPapel === 'socio' && (
                      <span><strong>Sócio:</strong> Acesso ao Dashboard, Produtos, Estoque, Pedidos, Clientes, Revendas e Relatórios financeiros completos. Sem permissão de gerenciar outros usuários.</span>
                    )}
                    {novoPapel === 'operador' && (
                      <span><strong>Operador:</strong> Acesso focado no dia a dia (Produtos, Estoque e Pedidos). Sem acesso financeiro ou de gestão de usuários.</span>
                    )}
                  </div>
                </div>

                <label className="modal-checkbox">
                  <input
                    type="checkbox"
                    checked={enviarConvite}
                    onChange={(e) => setEnviarConvite(e.target.checked)}
                  />
                  <span>Enviar convite por e-mail para definição da própria senha (Recomendado)</span>
                </label>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="modal-btn-cancelar"
                  onClick={() => setMostrarModalNovo(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="modal-btn-salvar"
                  disabled={processando}
                >
                  {processando ? 'Adicionando...' : 'Adicionar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ALTERAR PERFIL */}
      {modalPapelUsuario && (
        <div className="modal-overlay" onClick={() => setModalPapelUsuario(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Alterar Perfil de Acesso</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModalPapelUsuario(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>
                Alterando perfil de <strong>{modalPapelUsuario.nome || modalPapelUsuario.email}</strong>:
              </p>

              <div className="modal-group">
                <label>Selecione o novo perfil:</label>
                <select
                  defaultValue={modalPapelUsuario.papel}
                  onChange={(e) => handleAlterarPapel(modalPapelUsuario.id, e.target.value)}
                  disabled={processando}
                >
                  <option value="socio">🤝 Sócio</option>
                  <option value="operador">🛠️ Operador</option>
                  <option value="admin">👑 Administrador</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="modal-btn-cancelar"
                onClick={() => setModalPapelUsuario(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Usuarios
