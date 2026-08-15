import { lazy, Suspense, useEffect, useState } from 'react'
import './App.css'

import Loja from './pages/Loja'
import AdminAuth from './components/AdminAuth'
import AcompanharPedido from './pages/AcompanharPedido'
import { supabase } from './lib/supabase'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Produtos = lazy(() => import('./pages/Produtos'))
const Estoque = lazy(() => import('./pages/Estoque'))
const Pedidos = lazy(() => import('./pages/Pedidos'))
const Clientes = lazy(() => import('./pages/Clientes'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
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
  const [carregandoSessao, setCarregandoSessao] = useState(true)

  useEffect(() => {
    let componenteAtivo = true

    const carregarSessao = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (!componenteAtivo) {
        return
      }

      if (error) {
        console.error('Erro ao carregar sessão administrativa:', error.message)
        setSessao(null)
      } else {
        setSessao(data.session)
      }

      setCarregandoSessao(false)
    }

    carregarSessao()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_evento, proximaSessao) => {
      if (componenteAtivo) {
        setSessao(proximaSessao)
        setCarregandoSessao(false)
      }
    })

    return () => {
      componenteAtivo = false
      subscription.unsubscribe()
    }
  }, [])

  const possuiAcessoAdmin =
    sessao?.user?.app_metadata?.role === 'admin'

  if (carregandoSessao) {
    return <AdminAuth carregando />
  }

  if (!sessao) {
    return <AdminAuth />
  }

  if (!possuiAcessoAdmin) {
    return (
      <AdminAuth
        acessoNegado
        usuario={sessao.user}
      />
    )
  }

  return <PainelAdministrativo usuario={sessao.user} onNavegar={onNavegar} />
}

function PainelAdministrativo({ usuario, onNavegar }) {
  const [pagina, setPagina] = useState('dashboard')
  const [saindo, setSaindo] = useState(false)

  const menuPrincipal = [
    { id: 'dashboard', icone: '⌂', nome: 'Dashboard' },
    { id: 'produtos', icone: '♢', nome: 'Produtos' },
    { id: 'estoque', icone: '▣', nome: 'Estoque' },
    { id: 'pedidos', icone: '◇', nome: 'Pedidos' },
    { id: 'clientes', icone: '♡', nome: 'Clientes' },
    { id: 'relatorios', icone: '▦', nome: 'Relatórios' },
  ]

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

  const inicialUsuario = usuario?.email?.charAt(0).toUpperCase() || 'A'

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
              <span className="menu-name">{item.nome}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-card">
            <div className="user-avatar">{inicialUsuario}</div>
            <div className="user-info">
              <strong>Painel Admin</strong>
              <span>{usuario.email}</span>
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
          {pagina === 'dashboard' && <Dashboard setPagina={setPagina} />}
          {pagina === 'produtos' && <Produtos />}
          {pagina === 'estoque' && <Estoque />}
          {pagina === 'pedidos' && <Pedidos />}
          {pagina === 'clientes' && <Clientes />}
          {pagina === 'relatorios' && <Relatorios />}
        </Suspense>
      </main>
    </div>
  )
}

export default App
