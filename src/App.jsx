import { useState } from 'react'
import './App.css'

import Dashboard from './pages/Dashboard'
import Produtos from './pages/Produtos'
import Estoque from './pages/Estoque'
import Pedidos from './pages/Pedidos'
import Loja from './pages/Loja'

function App() {

  const [pagina, setPagina] = useState('dashboard')

  const menuPrincipal = [
    {
      id: 'dashboard',
      icone: '⌂',
      nome: 'Dashboard'
    },
    {
      id: 'produtos',
      icone: '♢',
      nome: 'Produtos'
    },
    {
      id: 'estoque',
      icone: '▣',
      nome: 'Estoque'
    },
    {
      id: 'pedidos',
      icone: '◇',
      nome: 'Pedidos'
    },
    {
      id: 'clientes',
      icone: '♧',
      nome: 'Clientes',
      bloqueado: true
    },
    {
      id: 'relatorios',
      icone: '◫',
      nome: 'Relatórios',
      bloqueado: true
    }
  ]

  const mudarPagina = (item) => {

    if (item.bloqueado) {
      return
    }

    setPagina(item.id)
  }

  const abrirLoja = () => {
    setPagina('loja')
  }

  const voltarDashboard = () => {
    setPagina('dashboard')
  }

  return (

    <div className="app">

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-symbol">
            ✿
          </div>

          <div className="brand-text">

            <span className="brand-name">
              Bazar
            </span>

            <strong>
              Encanto Feminino
            </strong>

          </div>

        </div>

        <div className="sidebar-divider" />

        <nav className="sidebar-nav">

          <div className="menu-label">
            MENU PRINCIPAL
          </div>

          {menuPrincipal.map((item) => (

            <button
              key={item.id}
              type="button"
              className={
                'menu-item' +
                (pagina === item.id ? ' active' : '') +
                (item.bloqueado ? ' disabled' : '')
              }
              onClick={() => mudarPagina(item)}
            >

              <span className="menu-icon">
                {item.icone}
              </span>

              <span className="menu-name">
                {item.nome}
              </span>

              {item.bloqueado && (
                <span className="coming-soon">
                  Em breve
                </span>
              )}

            </button>

          ))}

        </nav>

        {/* =====================================================
            PARTE INFERIOR
        ===================================================== */}

        <div className="sidebar-bottom">

          <div className="sidebar-divider" />

          {/* =================================================
              VER LOJA / VOLTAR AO DASHBOARD
          ================================================= */}

          {pagina !== 'loja' ? (

            <button
              className="menu-item"
              type="button"
              onClick={abrirLoja}
            >

              <span className="menu-icon">
                🛍
              </span>

              <span className="menu-name">
                Ver Loja Cliente
              </span>

            </button>

          ) : (

            <button
              className="menu-item"
              type="button"
              onClick={voltarDashboard}
            >

              <span className="menu-icon">
                ←
              </span>

              <span className="menu-name">
                Voltar ao Dashboard
              </span>

            </button>

          )}

          {/* =================================================
              CONFIGURAÇÕES
          ================================================= */}

          <button
            className="menu-item"
            type="button"
          >

            <span className="menu-icon">
              ⚙
            </span>

            <span className="menu-name">
              Configurações
            </span>

          </button>

          {/* =================================================
              USUÁRIO
          ================================================= */}

          <div className="user-card">

            <div className="user-avatar">
              A
            </div>

            <div className="user-info">

              <strong>
                Administrador
              </strong>

              <span>
                Painel administrativo
              </span>

            </div>

            <span className="user-status" />

          </div>

        </div>

      </aside>

      {/* =====================================================
          ÁREA PRINCIPAL
      ===================================================== */}

      <main className="main">

        <div className="decorative-leaf decorative-leaf-one">
          ❧
        </div>

        <div className="decorative-leaf decorative-leaf-two">
          ❧
        </div>

        <div className="main-content">

          {/* DASHBOARD */}

          {pagina === 'dashboard' && (
            <Dashboard
              setPagina={setPagina}
            />
          )}

          {/* PRODUTOS */}

          {pagina === 'produtos' && (
            <Produtos />
          )}

          {/* ESTOQUE */}

          {pagina === 'estoque' && (
            <Estoque />
          )}

          {/* PEDIDOS */}

          {pagina === 'pedidos' && (
            <Pedidos />
          )}

          {/* CLIENTES */}

          {pagina === 'clientes' && (
            <div className="coming-page">

              <div className="coming-icon">
                ♧
              </div>

              <h1>
                Clientes
              </h1>

              <p>
                Estamos preparando esta área.
              </p>

            </div>
          )}

          {/* RELATÓRIOS */}

          {pagina === 'relatorios' && (
            <div className="coming-page">

              <div className="coming-icon">
                ◫
              </div>

              <h1>
                Relatórios
              </h1>

              <p>
                Estamos preparando esta área.
              </p>

            </div>
          )}

          {/* =================================================
              LOJA DO CLIENTE
          ================================================= */}

          {pagina === 'loja' && (
            <Loja />
          )}

        </div>

      </main>

    </div>
  )
}

export default App