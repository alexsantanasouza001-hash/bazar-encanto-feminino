import { lazy, Suspense, useEffect, useState } from 'react'
import './App.css'

import Loja from './pages/Loja'
import AdminAuth from './components/AdminAuth'
import AcompanharPedido from './pages/AcompanharPedido'
import { supabase } from './lib/supabase'
import { carregarPerfilAdmin } from './storage'
import {
  normalizarPapel,
  obterTituloPapel,
  obterMenuPermitido,
  podeAcessarPagina
} from './pages/permissoesHelpers'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Produtos = lazy(() => import('./pages/Produtos'))
const Estoque = lazy(() => import('./pages/Estoque'))
const Pedidos = lazy(() => import('./pages/Pedidos'))
const Clientes = lazy(() => import('./pages/Clientes'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const Revendas = lazy(() => import('./pages/Revendas'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const Sobre = lazy(() => import('./pages/Sobre'))
const PoliticaPrivacidade = lazy(() => import('./pages/PoliticaPrivacidade'))
const Termos = lazy(() => import('./pages/Termos'))
const TrocasDevolucoes = lazy(() => import('./pages/TrocasDevolucoes'))

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
      {!rotaAcompanhamento && !rotaSobre && !rotaPrivacidade && !rotaTermos && !rotaTrocas && !lojaPublica && !rotaAdministrativa && (
        <Loja onNavegar={navegar} />
      )}
    </Suspense>
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
          {pagina === 'produtos' && <Produtos papelUsuario={papel} />}
          {pagina === 'estoque' && <Estoque papelUsuario={papel} />}
          {pagina === 'pedidos' && <Pedidos papelUsuario={papel} />}
          {pagina === 'clientes' && podeAcessarPagina(papel, 'clientes') && <Clientes />}
          {pagina === 'revendas' && podeAcessarPagina(papel, 'revendas') && <Revendas />}
          {pagina === 'relatorios' && podeAcessarPagina(papel, 'relatorios') && <Relatorios />}
          {pagina === 'usuarios' && podeAcessarPagina(papel, 'usuarios') && <Usuarios usuarioLogado={usuario} />}
        </Suspense>
      </main>
    </div>
  )
}

export default App
