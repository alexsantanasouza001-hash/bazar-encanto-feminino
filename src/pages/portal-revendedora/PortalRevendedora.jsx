import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { carregarDadosPortalRevendedora, cancelarVendaPortal } from '../../storage'
import { calcularResumoDashboard, calcularExtratoContaCorrente } from './portalHelpers'
import ViewDashboard from './ViewDashboard'
import ViewMinhasPecas from './ViewMinhasPecas'
import ViewRegistrarVenda from './ViewRegistrarVenda'
import ViewMinhasVendas from './ViewMinhasVendas'
import ViewMeusAcertos from './ViewMeusAcertos'
import ViewHistorico from './ViewHistorico'
import ViewPerfil from './ViewPerfil'
import ModalEditarVenda from './ModalEditarVenda'
import './PortalRevendedora.css'

export default function PortalRevendedora({
  usuario,
  revendedora,
  caminhoAtual,
  onNavegar,
  onLogout
}) {
  const [dados, setDados] = useState({
    remessas: [],
    vendas: [],
    acertos: [],
    pagamentos: [],
    devolucoes: []
  })
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [sucessoAviso, setSucessoAviso] = useState('')
  const [vendaEmEdicao, setVendaEmEdicao] = useState(null)

  const subpagina = useMemo(() => {
    if (caminhoAtual === '/revendedora/pecas') return 'pecas'
    if (caminhoAtual === '/revendedora/nova-venda') return 'nova-venda'
    if (caminhoAtual === '/revendedora/vendas') return 'vendas'
    if (caminhoAtual === '/revendedora/acertos') return 'acertos'
    if (caminhoAtual === '/revendedora/historico') return 'historico'
    if (caminhoAtual === '/revendedora/perfil') return 'perfil'
    return 'dashboard'
  }, [caminhoAtual])

  const navegarSubpagina = (sub) => {
    const rotas = {
      dashboard: '/revendedora',
      pecas: '/revendedora/pecas',
      'nova-venda': '/revendedora/nova-venda',
      vendas: '/revendedora/vendas',
      acertos: '/revendedora/acertos',
      historico: '/revendedora/historico',
      perfil: '/revendedora/perfil'
    }
    const destino = rotas[sub] || '/revendedora'
    if (onNavegar) {
      onNavegar(destino)
    }
  }

  const carregarDados = useCallback(async () => {
    if (!revendedora?.id) return
    try {
      setCarregando(true)
      const res = await carregarDadosPortalRevendedora(revendedora.id)
      if (res) {
        setDados(res)
      }
    } catch (err) {
      console.error('Erro ao carregar dados do portal:', err)
      setErro('Não foi possível atualizar seus dados. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }, [revendedora?.id])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const resumo = useMemo(() => {
    return calcularResumoDashboard(dados.remessas, dados.vendas, dados.pagamentos, dados.revendedora || revendedora)
  }, [dados, revendedora])

  const extrato = useMemo(() => {
    return calcularExtratoContaCorrente(dados.vendas, dados.pagamentos)
  }, [dados])

  const handleCancelarVenda = async (venda) => {
    if (!window.confirm(`Deseja realmente cancelar a venda de "${venda.produto_nome}" (${venda.quantidade} un.)?\nO estoque será devolvido à remessa.`)) {
      return
    }
    try {
      setCarregando(true)
      const res = await cancelarVendaPortal({ vendaId: venda.id })
      if (res?.sucesso) {
        setSucessoAviso('Venda cancelada com sucesso e estoque restaurado.')
        await carregarDados()
      } else {
        setErro(res?.mensagem || 'Falha ao cancelar venda.')
      }
    } catch (err) {
      setErro(err.message || 'Erro ao cancelar venda.')
    } finally {
      setCarregando(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      if (onLogout) onLogout()
      if (onNavegar) onNavegar('/revendedora/login')
    } catch (e) {
      console.error('Erro ao sair:', e)
    }
  }

  return (
    <div className="portal-root">
      {/* SIDEBAR DESKTOP */}
      <aside className="portal-sidebar">
        <div className="portal-sidebar-header">
          <div className="portal-brand">
            <span className="portal-brand-symbol">✿</span>
            <div className="portal-brand-title">
              <span className="portal-brand-name">Bazar</span>
              <strong className="portal-brand-sub">Encanto Feminino</strong>
            </div>
          </div>
          <span className="portal-badge-portal">Portal da Revendedora</span>
        </div>

        <nav className="portal-sidebar-nav">
          <button
            type="button"
            className={`portal-nav-btn ${subpagina === 'dashboard' ? 'active' : ''}`}
            onClick={() => navegarSubpagina('dashboard')}
          >
            <span className="portal-nav-icon">📊</span>
            <span>Início</span>
          </button>

          <button
            type="button"
            className={`portal-nav-btn ${subpagina === 'pecas' ? 'active' : ''}`}
            onClick={() => navegarSubpagina('pecas')}
          >
            <span className="portal-nav-icon">👗</span>
            <span>Minhas Peças</span>
          </button>

          <button
            type="button"
            className={`portal-nav-btn highlight ${subpagina === 'nova-venda' ? 'active' : ''}`}
            onClick={() => navegarSubpagina('nova-venda')}
          >
            <span className="portal-nav-icon">＋</span>
            <span>Registrar Venda</span>
          </button>

          <button
            type="button"
            className={`portal-nav-btn ${subpagina === 'vendas' ? 'active' : ''}`}
            onClick={() => navegarSubpagina('vendas')}
          >
            <span className="portal-nav-icon">🛍️</span>
            <span>Minhas Vendas</span>
            {resumo.vendasPendentesQtd > 0 && (
              <span style={{
                marginLeft: 'auto',
                background: 'var(--warning, #B8893F)',
                color: '#fff',
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '10px'
              }}>
                {resumo.vendasPendentesQtd}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`portal-nav-btn ${subpagina === 'acertos' ? 'active' : ''}`}
            onClick={() => navegarSubpagina('acertos')}
          >
            <span className="portal-nav-icon">💰</span>
            <span>Acertos</span>
          </button>

          <button
            type="button"
            className={`portal-nav-btn ${subpagina === 'historico' ? 'active' : ''}`}
            onClick={() => navegarSubpagina('historico')}
          >
            <span className="portal-nav-icon">📜</span>
            <span>Histórico</span>
          </button>

          <button
            type="button"
            className={`portal-nav-btn ${subpagina === 'perfil' ? 'active' : ''}`}
            onClick={() => navegarSubpagina('perfil')}
          >
            <span className="portal-nav-icon">👤</span>
            <span>Meu Perfil</span>
          </button>
        </nav>

        <div className="portal-sidebar-footer">
          <div className="portal-user-chip">
            <div className="portal-avatar">
              {(revendedora?.nome || 'R').charAt(0).toUpperCase()}
            </div>
            <div className="portal-user-meta">
              <strong>{revendedora?.nome || 'Revendedora'}</strong>
              <span>{usuario?.email}</span>
            </div>
          </div>

          <button
            type="button"
            className="portal-nav-btn"
            style={{ color: 'var(--danger, #B85F4A)', padding: '8px 12px' }}
            onClick={handleSignOut}
          >
            <span className="portal-nav-icon">↳</span>
            <span>Sair do Portal</span>
          </button>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="portal-main">
        {/* TOPBAR MOBILE */}
        <header className="portal-topbar-mobile">
          <div className="portal-topbar-brand">
            <span style={{ color: 'var(--accent, #C9A35A)', fontSize: '20px' }}>✿</span>
            <strong>Portal da Revendedora</strong>
          </div>
          <div className="portal-topbar-user">
            <div className="portal-avatar" style={{ width: '30px', height: '30px', fontSize: '12px' }}>
              {(revendedora?.nome || 'R').charAt(0).toUpperCase()}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-secondary)' }}
              title="Sair"
            >
              ↳
            </button>
          </div>
        </header>

        <div className="portal-content">
          {erro && (
            <div style={{
              background: 'var(--danger-light, #F5E3DE)',
              color: 'var(--danger, #B85F4A)',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>{erro}</span>
              <button
                type="button"
                onClick={() => setErro('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>
          )}

          {sucessoAviso && (
            <div style={{
              background: 'var(--success-light, #E8EEE2)',
              color: 'var(--success, #56745A)',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>{sucessoAviso}</span>
              <button
                type="button"
                onClick={() => setSucessoAviso('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>
          )}

          {subpagina === 'dashboard' && (
            <ViewDashboard
              revendedora={revendedora}
              resumo={resumo}
              onNavegar={navegarSubpagina}
              carregando={carregando}
            />
          )}

          {subpagina === 'pecas' && (
            <ViewMinhasPecas
              remessas={dados.remessas}
              onRegistrarVenda={() => navegarSubpagina('nova-venda')}
              carregando={carregando}
            />
          )}

          {subpagina === 'nova-venda' && (
            <ViewRegistrarVenda
              revendedora={revendedora}
              remessas={dados.remessas}
              onVendaSucesso={(msg) => {
                setSucessoAviso(msg)
                carregarDados()
                navegarSubpagina('vendas')
              }}
            />
          )}

          {subpagina === 'vendas' && (
            <ViewMinhasVendas
              vendas={dados.vendas}
              remessas={dados.remessas}
              revendedora={dados.revendedora || revendedora}
              onNovaVenda={() => navegarSubpagina('nova-venda')}
              onEditarVenda={(v) => setVendaEmEdicao(v)}
              onCancelarVenda={handleCancelarVenda}
              carregando={carregando}
            />
          )}

          {subpagina === 'acertos' && (
            <ViewMeusAcertos
              vendas={dados.vendas}
              remessas={dados.remessas}
              pagamentos={dados.pagamentos}
              acertos={dados.acertos}
              revendedora={dados.revendedora || revendedora}
              resumo={resumo}
              extrato={extrato}
              onAtualizarDados={carregarDados}
              carregando={carregando}
            />
          )}

          {subpagina === 'historico' && (
            <ViewHistorico
              remessas={dados.remessas}
              vendas={dados.vendas}
              pagamentos={dados.pagamentos}
              devolucoes={dados.devolucoes}
              onEditarVenda={(v) => setVendaEmEdicao(v)}
              carregando={carregando}
            />
          )}

          {subpagina === 'perfil' && (
            <ViewPerfil
              revendedora={revendedora}
              usuario={usuario}
              onSenhaAlterada={(msg) => setSucessoAviso(msg)}
            />
          )}

          {vendaEmEdicao && (
            <ModalEditarVenda
              venda={vendaEmEdicao}
              remessas={dados.remessas}
              revendedora={revendedora}
              onFechar={() => setVendaEmEdicao(null)}
              onSalvarSucesso={(msg) => {
                setSucessoAviso(msg)
                setVendaEmEdicao(null)
                carregarDados()
              }}
            />
          )}
        </div>
      </div>

      {/* BOTTOM NAVIGATION MOBILE */}
      <nav className="portal-bottom-nav">
        <button
          type="button"
          className={`portal-bottom-btn ${subpagina === 'dashboard' ? 'active' : ''}`}
          onClick={() => navegarSubpagina('dashboard')}
        >
          <span className="nav-icon">📊</span>
          <span>Início</span>
        </button>

        <button
          type="button"
          className={`portal-bottom-btn ${subpagina === 'pecas' ? 'active' : ''}`}
          onClick={() => navegarSubpagina('pecas')}
        >
          <span className="nav-icon">👗</span>
          <span>Peças</span>
        </button>

        <button
          type="button"
          className="portal-bottom-btn vender-destaque"
          onClick={() => navegarSubpagina('nova-venda')}
        >
          <div className="nav-icon-circle">＋</div>
          <span>Vender</span>
        </button>

        <button
          type="button"
          className={`portal-bottom-btn ${subpagina === 'vendas' ? 'active' : ''}`}
          onClick={() => navegarSubpagina('vendas')}
        >
          <span className="nav-icon">🛍️</span>
          <span>Vendas</span>
        </button>

        <button
          type="button"
          className={`portal-bottom-btn ${subpagina === 'acertos' ? 'active' : ''}`}
          onClick={() => navegarSubpagina('acertos')}
        >
          <span className="nav-icon">💰</span>
          <span>Acertos</span>
        </button>
      </nav>
    </div>
  )
}
