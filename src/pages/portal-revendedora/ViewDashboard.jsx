import { formatarMoeda } from './portalHelpers'

export default function ViewDashboard({ revendedora, resumo, onNavegar, _carregando }) {
  return (
    <div>
      <div className="portal-header-greeting">
        <h1>Olá, {revendedora?.nome?.split(' ')[0] || 'Revendedora'}!</h1>
        <p>Acompanhe aqui o desempenho das suas peças em consignação</p>
      </div>

      {resumo.vendasPendentesQtd > 0 && (
        <div className="portal-alert-pendencias">
          <div>
            <strong>Atenção:</strong> Você tem {resumo.vendasPendentesQtd} venda(s) aguardando conferência do Bazar.
          </div>
          <button type="button" onClick={() => onNavegar('vendas')}>
            Ver Vendas
          </button>
        </div>
      )}

      <div className="portal-grid-resumo">
        <div className="portal-card-metric highlight-primary">
          <span className="metric-label">Peças comigo</span>
          <span className="metric-value">{resumo.pecasComigo}</span>
          <span className="metric-sub">Em consignação</span>
        </div>

        <div className="portal-card-metric highlight-accent">
          <span className="metric-label">Vendidas</span>
          <span className="metric-value">{resumo.vendidas}</span>
          <span className="metric-sub">{resumo.vendasConfirmadasQtd} vendas confirmadas</span>
        </div>

        <div className="portal-card-metric highlight-success">
          <span className="metric-label">Disponíveis</span>
          <span className="metric-value">{resumo.disponiveis}</span>
          <span className="metric-sub">Prontas para venda</span>
        </div>

        <div className="portal-card-metric">
          <span className="metric-label">Total Vendido</span>
          <span className="metric-value">{formatarMoeda(resumo.totalVendido)}</span>
          <span className="metric-sub">Volume bruto</span>
        </div>

        <div className="portal-card-metric highlight-accent">
          <span className="metric-label">Minha Comissão</span>
          <span className="metric-value" style={{ color: 'var(--accent, #C9A35A)' }}>
            {formatarMoeda(resumo.minhaComissao)}
          </span>
          <span className="metric-sub">Sua remuneração</span>
        </div>

        <div className="portal-card-metric">
          <span className="metric-label">Valor do Bazar</span>
          <span className="metric-value">{formatarMoeda(resumo.valorBazar)}</span>
          <span className="metric-sub">Líquido da loja</span>
        </div>

        <div className="portal-card-metric highlight-warning">
          <span className="metric-label">Saldo a Repassar</span>
          <span className="metric-value" style={{ color: resumo.saldoRepassar > 0 ? 'var(--warning, #B8893F)' : 'var(--success)' }}>
            {formatarMoeda(resumo.saldoRepassar)}
          </span>
          <span className="metric-sub">Pendente de acerto</span>
        </div>

        {resumo.vendasAReceberQtd > 0 && (
          <div className="portal-card-metric">
            <span className="metric-label">A Receber</span>
            <span className="metric-value">{formatarMoeda(resumo.valorAReceber)}</span>
            <span className="metric-sub">
              {resumo.vendasAReceberQtd} {resumo.vendasAReceberQtd === 1 ? 'venda' : 'vendas'} — soma quando o dinheiro cair
            </span>
          </div>
        )}
      </div>

      <div className="portal-section-title">
        <span>Ações Rápidas</span>
      </div>

      <div className="portal-quick-actions">
        <button
          type="button"
          className="portal-btn-action primary"
          onClick={() => onNavegar('nova-venda')}
        >
          <span>＋</span> Registrar Nova Venda
        </button>

        <button
          type="button"
          className="portal-btn-action"
          onClick={() => onNavegar('pecas')}
        >
          <span>👗</span> Consultar Minhas Peças
        </button>

        <button
          type="button"
          className="portal-btn-action"
          onClick={() => onNavegar('acertos')}
        >
          <span>💰</span> Extrato de Acertos
        </button>
      </div>
    </div>
  )
}
