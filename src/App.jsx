import { lazy, Suspense, useEffect, useState } from 'react'
import './App.css'

import Loja from './pages/Loja'
import AdminAuth from './components/AdminAuth'
import AcompanharPedido from './pages/AcompanharPedido'
import { supabase } from './lib/supabase'
import { carregarPerfilAdmin, carregarPerfilRevendedoraLogada } from './storage'
import {
  normalizarPapel,
  obterTituloPapel,
  obterMenuPermitido,
  podeAcessarPagina
} from './pages/permissoesHelpers'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const VendaDireta = lazy(() => import('./pages/VendaDireta'))
const Produtos = lazy(() => import('./pages/Produtos'))
const Estoque = lazy(() => import('./pages/Estoque'))
const Pedidos = lazy(() => import('./pages/Pedidos'))
const Clientes = lazy(() => import('./pages/Clientes'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const Revendas = lazy(() => import('./pages/Revendas'))
const Financeiro = lazy(() => import('./pages/Financeiro'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const Sobre = lazy(() => import('./pages/Sobre'))
const PoliticaPrivacidade = lazy(() => import('./pages/PoliticaPrivacidade'))
const Termos = lazy(() => import('./pages/Termos'))
const TrocasDevolucoes = lazy(() => import('./pages/TrocasDevolucoes'))
const PortalRevendedora = lazy(() => import('./pages/portal-revendedora/PortalRevendedora'))
const RevendedoraLogin = lazy(() => import('./pages/portal-revendedora/RevendedoraLogin'))

function LoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '60vh',
      color: 'var(--primary)',
      fontFamily: 'var(--heading)',
      fontSize: '1.2rem'
    }}>
      Carregando...
    </div>
  )
}

function App() {
  const [caminhoAtual, setCaminhoAtual] = useState(window.location.pathname)

  useEffect(() => {
    const handlePopState = () => {
      setCaminhoAtual(window.location.pathname)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navegar = (caminho) => {
    window.history.pushState({}, '', caminho)
    setCaminhoAtual(caminho)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const lojaPublica = caminhoAtual === '/' || caminhoAtual === ''
  const rotaAdministrativa = caminhoAtual === '/admin' || caminhoAtual.startsWith('/admin/')
  const rotaRevendedora = caminhoAtual === '/revendedora' || caminhoAtual.startsWith('/revendedora/')
  const rotaAcompanhamento = caminhoAtual === '/acompanhar-pedido'
  const rotaSobre = caminhoAtual === '/sobre'
  const rotaPrivacidade = caminhoAtual === '/politica-de-privacidade'
  const rotaTermos = caminhoAtual === '/termos'
  const rotaTrocas = caminhoAtual === '/trocas-e-devolucoes'

  return (
    <Suspense fallback={<LoadingFallback />}>
      {rotaAcompanhamento && <AcompanharPedido onNavegar={navegar} />}
      {rotaSobre && <Sobre onNavegar={navegar} />}
      {rotaPrivacidade && <PoliticaPrivacidade onNavegar={navegar} />}
      {rotaTermos && <Termos onNavegar={navegar} />}
      {rotaTrocas && <TrocasDevolucoes onNavegar={navegar} />}
      {lojaPublica && <Loja onNavegar={navegar} />}
      {rotaAdministrativa && <PainelAdministrativoProtegido onNavegar={navegar} />}
      {rotaRevendedora && <PortalRevendedoraProtegido onNavegar={navegar} caminhoAtual={caminhoAtual} />}
      {!rotaAcompanhamento && !rotaSobre && !rotaPrivacidade && !rotaTermos && !rotaTrocas && !lojaPublica && !rotaAdministrativa && !rotaRevendedora && (
        <Loja onNavegar={navegar} />
      )}
    </Suspense>
  )
}

function PortalRevendedoraProtegido({ onNavegar, caminhoAtual }) {
  const [sessao, setSessao] = useState(null)
  const [perfilRevendedora, setPerfilRevendedora] = useState(null)
  const [carregandoSessao, setCarregandoSessao] = useState(true)

  useEffect(() => {
    let componenteAtivo = true

    const carregarSessaoEPerfil = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (!componenteAtivo) return

        if (error || !data?.session) {
          setSessao(null)
          setPerfilRevendedora(null)
          setCarregandoSessao(false)
          return
        }

        const user = data.session.user
        setSessao(data.session)

        const perfil = await carregarPerfilRevendedoraLogada(user.id)
        if (componenteAtivo) {
          setPerfilRevendedora(perfil)
        }
      } catch (e) {
        console.error('Erro ao verificar sessão da revendedora:', e)
      } finally {
        if (componenteAtivo) {
          setCarregandoSessao(false)
        }
      }
    }

    carregarSessaoEPerfil()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_evento, proximaSessao) => {
      if (componenteAtivo) {
        setSessao(proximaSessao)
        if (proximaSessao?.user) {
          const perfil = await carregarPerfilRevendedoraLogada(proximaSessao.user.id)
          if (componenteAtivo) {
            setPerfilRevendedora(perfil)
          }
        } else {
          setPerfilRevendedora(null)
        }
        setCarregandoSessao(false)
      }
    })

    return () => {
      componenteAtivo = false
      subscription.unsubscribe()
    }
  }, [])

  if (carregandoSessao) {
    return <LoadingFallback />
  }

  // Não autenticada: redireciona para a tela de login da revendedora
  if (!sessao) {
    return (
      <RevendedoraLogin
        onNavegar={onNavegar}
        onLoginSucesso={(perfil) => setPerfilRevendedora(perfil)}
      />
    )
  }

  // Usuário autenticado mas sem cadastro de revendedora associado
  if (!perfilRevendedora) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backgroundColor: 'var(--background, #F7F3EB)',
        fontFamily: 'sans-serif'
      }}>
        <div style={{
          maxWidth: '460px',
          background: 'var(--surface, #FFFDF8)',
          border: '1px solid var(--border, #E5DDCF)',
          borderRadius: '12px',
          padding: '32px 24px',
          textAlign: 'center',
          boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', color: 'var(--warning, #B8893F)' }}>⚠️</div>
          <h2 style={{ fontSize: '18px', color: 'var(--primary, #234B36)', margin: '0 0 8px' }}>
            Acesso Restrito ao Portal
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary, #6E746B)', lineHeight: 1.5, margin: '0 0 24px' }}>
            A conta <strong>{sessao.user.email}</strong> está autenticada, porém não está vinculada a nenhuma revendedora ativa cadastrada no Bazar Encanto Feminino.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              type="button"
              style={{
                background: 'var(--primary, #234B36)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              onClick={() => (onNavegar ? onNavegar('/') : (window.location.href = '/'))}
            >
              Ir para a Loja
            </button>
            <button
              type="button"
              style={{
                background: 'transparent',
                color: 'var(--danger, #B85F4A)',
                border: '1px solid var(--border, #E5DDCF)',
                borderRadius: '8px',
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              onClick={async () => {
                await supabase.auth.signOut()
                setSessao(null)
                setPerfilRevendedora(null)
                if (onNavegar) onNavegar('/revendedora/login')
              }}
            >
              Trocar de Conta
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Revendedora com acesso bloqueado
  if (perfilRevendedora.status_acesso === 'BLOQUEADO') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backgroundColor: 'var(--background, #F7F3EB)'
      }}>
        <div style={{
          maxWidth: '460px',
          background: 'var(--surface, #FFFDF8)',
          border: '1px solid var(--danger, #B85F4A)',
          borderRadius: '12px',
          padding: '32px 24px',
          textAlign: 'center',
          boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', color: 'var(--danger, #B85F4A)' }}>🚫</div>
          <h2 style={{ fontSize: '18px', color: 'var(--danger, #B85F4A)', margin: '0 0 8px' }}>
            Acesso ao Portal Bloqueado
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary, #6E746B)', lineHeight: 1.5, margin: '0 0 24px' }}>
            Olá, <strong>{perfilRevendedora.nome}</strong>. O seu acesso ao Portal da Revendedora foi temporariamente suspenso pela administração do Bazar. Entre em contato com a gerência para regularização.
          </p>
          <button
            type="button"
            style={{
              background: 'var(--primary, #234B36)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            onClick={async () => {
              await supabase.auth.signOut()
              setSessao(null)
              setPerfilRevendedora(null)
              if (onNavegar) onNavegar('/revendedora/login')
            }}
          >
            Sair da Conta
          </button>
        </div>
      </div>
    )
  }

  // Se estiver na rota de login mas já autenticada com perfil válido, exibe o portal
  return (
    <PortalRevendedora
      usuario={sessao.user}
      revendedora={perfilRevendedora}
      caminhoAtual={caminhoAtual === '/revendedora/login' ? '/revendedora' : caminhoAtual}
      onNavegar={onNavegar}
      onLogout={() => {
        setSessao(null)
        setPerfilRevendedora(null)
      }}
    />
  )
}

function PainelAdministrativoProtegido({ onNavegar }) {
  const [sessao, setSessao] = useState(null)
  const [perfilAdmin, setPerfilAdmin] = useState(null)
  const [carregandoSessao, setCarregandoSessao] = useState(true)

  useEffect(() => {
    let componenteAtivo = true

    const carregarSessaoEPerfil = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (!componenteAtivo) return

        if (error || !data?.session) {
          setSessao(null)
          setPerfilAdmin(null)
          setCarregandoSessao(false)
          return
        }

        const user = data.session.user
        setSessao(data.session)

        // Carrega perfil na tabela admin_usuarios
        const perfil = await carregarPerfilAdmin(user.id, user.email)
        if (componenteAtivo) {
          setPerfilAdmin(perfil)
        }
      } catch (e) {
        console.error('Erro ao verificar permissões de admin:', e)
      } finally {
        if (componenteAtivo) {
          setCarregandoSessao(false)
        }
      }
    }

    carregarSessaoEPerfil()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_evento, proximaSessao) => {
      if (componenteAtivo) {
        setSessao(proximaSessao)
        if (proximaSessao?.user) {
          const perfil = await carregarPerfilAdmin(
            proximaSessao.user.id,
            proximaSessao.user.email
          )
          if (componenteAtivo) {
            setPerfilAdmin(perfil)
          }
        } else {
          setPerfilAdmin(null)
        }
        setCarregandoSessao(false)
      }
    })

    return () => {
      componenteAtivo = false
      subscription.unsubscribe()
    }
  }, [])

  if (carregandoSessao) {
    return <AdminAuth carregando />
  }

  if (!sessao) {
    return <AdminAuth />
  }

  // Verifica se a conta está desativada
  if (perfilAdmin && perfilAdmin.ativo === false) {
    return <AdminAuth contaInativa usuario={sessao.user} />
  }

  // Identifica o papel administrativo do usuário
  const papel =
    perfilAdmin?.papel ||
    normalizarPapel(sessao?.user?.app_metadata?.role) ||
    (sessao?.user?.app_metadata?.role === 'admin' ? 'admin' : null)

  if (!papel) {
    return (
      <AdminAuth
        acessoNegado
        usuario={sessao.user}
      />
    )
  }

  return (
    <PainelAdministrativo
      usuario={sessao.user}
      perfil={perfilAdmin}
      papel={papel}
      onNavegar={onNavegar}
    />
  )
}

function PainelAdministrativo({ usuario, perfil, papel, onNavegar }) {
  const [pagina, setPagina] = useState('dashboard')
  const [saindo, setSaindo] = useState(false)
  const [pedidosNovosCount, setPedidosNovosCount] = useState(0)

  useEffect(() => {
    const handler = (e) => {
      setPedidosNovosCount(Number(e?.detail ?? 0))
    }
    window.addEventListener('bazar_pedidos_novos_count', handler)
    return () => window.removeEventListener('bazar_pedidos_novos_count', handler)
  }, [])

  // Monta menu dinâmico de acordo com o papel do usuário
  const menuPrincipal = obterMenuPermitido(papel)

  // Se a página selecionada não for permitida para o perfil, redireciona para o Dashboard
  useEffect(() => {
    if (!podeAcessarPagina(papel, pagina)) {
      setPagina('dashboard')
    }
  }, [papel, pagina])

  const handleLogout = async () => {
    try {
      setSaindo(true)
      await supabase.auth.signOut()
    } catch (erro) {
      console.error('Erro ao encerrar sessão:', erro)
    } finally {
      setSaindo(false)
    }
  }

  const nomeExibicao = perfil?.nome || usuario?.user_metadata?.name || usuario?.email || 'Administrador'
  const inicialUsuario = nomeExibicao.charAt(0).toUpperCase() || 'A'
  const tituloPapel = obterTituloPapel(papel)

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-symbol">✿</div>
          <div className="brand-text">
            <span className="brand-name">Bazar</span>
            <strong>Encanto Feminino</strong>
          </div>
        </div>

        <div className="sidebar-divider" />

        <nav className="sidebar-nav">
          <div className="menu-label">NAVEGAÇÃO</div>
          {menuPrincipal.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`menu-item ${pagina === item.id ? 'active' : ''}`}
              onClick={() => setPagina(item.id)}
            >
              <span className="menu-icon">{item.icone}</span>
              <span className="menu-name">{item.label || item.nome}</span>
              {item.id === 'pedidos' && pedidosNovosCount > 0 && (
                <span className="menu-badge-novos" title={`${pedidosNovosCount} novos pedidos recebidos`}>
                  ● {pedidosNovosCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-card">
            <div className="user-avatar">{inicialUsuario}</div>
            <div className="user-info">
              <strong style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {papel === 'admin' ? '👑' : papel === 'socio' ? '🤝' : '🛠️'} {tituloPapel}
              </strong>
              <span title={usuario.email}>{usuario.email}</span>
            </div>
            <span className="user-status" />
          </div>

          <button
            type="button"
            className="menu-item"
            style={{ marginTop: '10px' }}
            onClick={() => (onNavegar ? onNavegar('/') : (window.location.href = '/'))}
          >
            <span className="menu-icon">←</span>
            <span className="menu-name">Ir para a Loja</span>
          </button>

          <button
            type="button"
            className="menu-item admin-logout-button"
            onClick={handleLogout}
            disabled={saindo}
          >
            <span className="menu-icon">↳</span>
            <span className="menu-name">{saindo ? 'Saindo...' : 'Sair da Conta'}</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <Suspense fallback={<LoadingFallback />}>
          {pagina === 'dashboard' && <Dashboard setPagina={setPagina} papelUsuario={papel} />}
          {pagina === 'venda_direta' && <VendaDireta usuarioLogado={usuario} papelUsuario={papel} setPagina={setPagina} />}
          {pagina === 'produtos' && <Produtos papelUsuario={papel} />}
          {pagina === 'estoque' && <Estoque papelUsuario={papel} />}
          {pagina === 'pedidos' && <Pedidos papelUsuario={papel} usuarioLogado={usuario} />}
          {pagina === 'clientes' && podeAcessarPagina(papel, 'clientes') && <Clientes />}
          {pagina === 'revendas' && podeAcessarPagina(papel, 'revendas') && <Revendas />}
          {pagina === 'financeiro' && podeAcessarPagina(papel, 'financeiro') && <Financeiro papelUsuario={papel} usuarioLogado={usuario} />}
          {pagina === 'relatorios' && podeAcessarPagina(papel, 'relatorios') && <Relatorios />}
          {pagina === 'usuarios' && podeAcessarPagina(papel, 'usuarios') && <Usuarios usuarioLogado={usuario} />}
        </Suspense>
      </main>
    </div>
  )
}

export default App
