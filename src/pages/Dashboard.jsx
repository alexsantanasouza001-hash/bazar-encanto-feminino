function Dashboard({ setPagina }) {

  return (

    <div className="dashboard-page">

      {/* ==========================================
          CABEÇALHO
      ========================================== */}

      <header className="dashboard-header">

        <div>

          <span className="dashboard-eyebrow">
            VISÃO GERAL
          </span>

         <h1>
  Olá, Administrador ✨
</h1>

          <p>
            Acompanhe o desempenho do seu Bazar Encanto Feminino.
          </p>

        </div>


        <div className="dashboard-user-area">

          <button className="notification-button">
            ♧
            <span className="notification-dot"></span>
          </button>


          <div className="dashboard-user">

            <div className="dashboard-avatar">
              A
            </div>

            <div className="dashboard-user-info">

              <strong>
                Administrador
              </strong>

              <span>
                Painel administrativo
              </span>

            </div>

          </div>

        </div>

      </header>


      {/* ==========================================
          CARDS
      ========================================== */}

      <section className="dashboard-cards">


        <div className="dashboard-card">

          <div className="dashboard-card-top">

            <div className="dashboard-card-icon purple">
              R$
            </div>

            <span className="dashboard-card-label">
              Vendas do mês
            </span>

          </div>


          <div className="dashboard-card-value">
            R$ 5.280,00
          </div>


          <div className="dashboard-card-footer positive">
            ↑ 12,5% este mês
          </div>

        </div>


        <div className="dashboard-card">

          <div className="dashboard-card-top">

            <div className="dashboard-card-icon green">
              ♢
            </div>

            <span className="dashboard-card-label">
              Produtos
            </span>

          </div>


          <div className="dashboard-card-value">
            127
          </div>


          <div className="dashboard-card-footer">
            Produtos cadastrados
          </div>

        </div>


        <div className="dashboard-card">

          <div className="dashboard-card-top">

            <div className="dashboard-card-icon rose">
              ♧
            </div>

            <span className="dashboard-card-label">
              Clientes
            </span>

          </div>


          <div className="dashboard-card-value">
            84
          </div>


          <div className="dashboard-card-footer">
            Clientes cadastrados
          </div>

        </div>


        <div className="dashboard-card">

          <div className="dashboard-card-top">

            <div className="dashboard-card-icon gold">
              ◇
            </div>

            <span className="dashboard-card-label">
              Pedidos
            </span>

          </div>


          <div className="dashboard-card-value">
            32
          </div>


          <div className="dashboard-card-footer">
            Pedidos este mês
          </div>

        </div>


      </section>


      {/* ==========================================
          GRÁFICOS / ESTOQUE
      ========================================== */}

      <section className="dashboard-grid">


        {/* VENDAS */}

        <div className="dashboard-panel sales-panel">


          <div className="dashboard-panel-header">

            <div>

              <h2>
                Vendas
              </h2>

              <p>
                Desempenho dos últimos meses
              </p>

            </div>


            <button className="period-button">
              Este mês ▾
            </button>

          </div>


          <div className="sales-summary">

            <div>

              <span>
                Total vendido
              </span>

              <strong>
                R$ 5.280
              </strong>

            </div>

          </div>


          <div className="sales-chart">


            <div className="chart-grid-line line-one"></div>
            <div className="chart-grid-line line-two"></div>
            <div className="chart-grid-line line-three"></div>


            <div className="bars">


              <div className="bar-container">

                <div className="bar bar-1"></div>

                <span>
                  Mar
                </span>

              </div>


              <div className="bar-container">

                <div className="bar bar-2"></div>

                <span>
                  Abr
                </span>

              </div>


              <div className="bar-container">

                <div className="bar bar-3"></div>

                <span>
                  Mai
                </span>

              </div>


              <div className="bar-container">

                <div className="bar bar-4"></div>

                <span>
                  Jun
                </span>

              </div>


              <div className="bar-container">

                <div className="bar bar-5"></div>

                <span>
                  Jul
                </span>

              </div>


              <div className="bar-container">

                <div className="bar bar-6"></div>

                <span>
                  Ago
                </span>

              </div>


            </div>

          </div>

        </div>


        {/* ESTOQUE */}

        <div className="dashboard-panel">


          <div className="dashboard-panel-header">

            <div>

              <h2>
                Estoque
              </h2>

              <p>
                Situação atual
              </p>

            </div>


            <button
              className="panel-link"
              onClick={() => setPagina('estoque')}
            >
              Ver estoque →
            </button>

          </div>


          <div className="stock-list">


            <div className="stock-item">

              <div className="stock-item-info">

                <span className="stock-icon">
                  ♡
                </span>

                <span>
                  Vestidos
                </span>

              </div>

              <strong>
                42
              </strong>

            </div>


            <div className="stock-item">

              <div className="stock-item-info">

                <span className="stock-icon">
                  ♢
                </span>

                <span>
                  Blusas
                </span>

              </div>

              <strong>
                36
              </strong>

            </div>


            <div className="stock-item">

              <div className="stock-item-info">

                <span className="stock-icon">
                  ◇
                </span>

                <span>
                  Calças
                </span>

              </div>

              <strong>
                24
              </strong>

            </div>


            <div className="stock-item">

              <div className="stock-item-info">

                <span className="stock-icon">
                  ♧
                </span>

                <span>
                  Shorts
                </span>

              </div>

              <strong>
                18
              </strong>

            </div>


            <div className="stock-item low-stock">

              <div className="stock-item-info">

                <span className="stock-warning">
                  !
                </span>

                <span>
                  Pouco estoque
                </span>

              </div>

              <strong>
                7
              </strong>

            </div>


          </div>

        </div>


      </section>


      {/* ==========================================
          ÚLTIMAS VENDAS
      ========================================== */}

      <section className="dashboard-panel recent-sales-panel">


        <div className="dashboard-panel-header">

          <div>

            <h2>
              Últimas vendas
            </h2>

            <p>
              Confira as vendas mais recentes
            </p>

          </div>


          <button className="panel-link">
            Ver todas →
          </button>

        </div>


        <div className="dashboard-table-wrapper">


          <table className="dashboard-table">

            <thead>

              <tr>

                <th>
                  Cliente
                </th>

                <th>
                  Produto
                </th>

                <th>
                  Data
                </th>

                <th>
                  Valor
                </th>

                <th>
                  Status
                </th>

              </tr>

            </thead>


            <tbody>


              <tr>

                <td>
                  <strong>
                    Mariana Silva
                  </strong>
                </td>

                <td>
                  Vestido Farm
                </td>

                <td>
                  08/08/2026
                </td>

                <td>
                  <strong>
                    R$ 189,90
                  </strong>
                </td>

                <td>

                  <span className="status paid">
                    Pago
                  </span>

                </td>

              </tr>


              <tr>

                <td>
                  <strong>
                    Camila Souza
                  </strong>
                </td>

                <td>
                  Blusa Farm
                </td>

                <td>
                  08/08/2026
                </td>

                <td>
                  <strong>
                    R$ 129,90
                  </strong>
                </td>

                <td>

                  <span className="status paid">
                    Pago
                  </span>

                </td>

              </tr>


              <tr>

                <td>
                  <strong>
                    Juliana Costa
                  </strong>
                </td>

                <td>
                  Short Farm
                </td>

                <td>
                  07/08/2026
                </td>

                <td>
                  <strong>
                    R$ 99,90
                  </strong>
                </td>

                <td>

                  <span className="status pending">
                    Pendente
                  </span>

                </td>

              </tr>


            </tbody>

          </table>


        </div>


      </section>


    </div>

  )

}


export default Dashboard