import { useMemo } from 'react'
import { formatarMoeda, formatarData } from './portalHelpers'

export default function ViewHistorico({ remessas, vendas, pagamentos, devolucoes, onEditarVenda, _carregando }) {
  const eventos = useMemo(() => {
    const lista = []

    for (const r of remessas) {
      lista.push({
        id: `rem-${r.id}`,
        tipo: 'REMESSA',
        data: r.data_envio || r.criado_em,
        titulo: `Remessa Recebida ${r.numero}`,
        descricao: `${r.total_pecas_enviadas} peças enviadas no valor total de ${formatarMoeda(r.total_valor_enviado)}`,
        badge: 'Remessa'
      })
    }

    for (const v of vendas) {
      const status = (v.status || 'CONFIRMADA').toUpperCase()
      lista.push({
        id: `venda-${v.id}`,
        tipo: 'VENDA',
        venda: v,
        data: v.data_venda || v.criado_em,
        titulo: status === 'AGUARDANDO_CONFERENCIA'
          ? `Venda Registrada (Aguardando Conferência)`
          : status === 'RECUSADA'
          ? `Venda Recusada: ${v.produto_nome}`
          : `Venda Confirmada: ${v.produto_nome}`,
        descricao: `${v.quantidade} un. • ${formatarMoeda(v.total_venda ?? v.valor_total_bruto)} • Comissão: ${formatarMoeda(v.valor_comissao)}`,
        badge: status === 'AGUARDANDO_CONFERENCIA' ? 'Pendente' : status === 'RECUSADA' ? 'Recusada' : 'Venda'
      })
    }

    for (const p of pagamentos) {
      lista.push({
        id: `pag-${p.id}`,
        tipo: 'PAGAMENTO',
        data: p.data_pagamento || p.criado_em,
        titulo: `Repasse Confirmado (${p.forma_pagamento || 'Pix'})`,
        descricao: `Valor repassado: ${formatarMoeda(p.valor)}${p.observacao ? ` - ${p.observacao}` : ''}`,
        badge: 'Repasse'
      })
    }

    for (const d of devolucoes) {
      lista.push({
        id: `dev-${d.id}`,
        tipo: 'DEVOLUCAO',
        data: d.data_devolucao || d.criado_em,
        titulo: `Devolução Confirmada`,
        descricao: `${d.quantidade} un. devolvida(s) ao estoque do Bazar`,
        badge: 'Devolução'
      })
    }

    lista.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    return lista
  }, [remessas, vendas, pagamentos, devolucoes])

  return (
    <div>
      <div className="portal-section-title">
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontFamily: 'serif' }}>Histórico Geral</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Linha do tempo completa de movimentações, vendas e acertos
          </p>
        </div>
      </div>

      {eventos.length === 0 ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '30px 20px',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          Nenhum evento registrado ainda.
        </div>
      ) : (
        <div className="portal-items-list">
          {eventos.map((ev) => (
            <div key={ev.id} className="portal-item-card">
              <div className="portal-item-info">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--text)' }}>{ev.titulo}</strong>
                  <span className="portal-tag" style={{ fontWeight: 600 }}>{ev.badge}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {ev.descricao}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  {formatarData(ev.data, true)}
                </div>
                {ev.tipo === 'VENDA' && ev.venda?.status === 'AGUARDANDO_CONFERENCIA' && (
                  <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="portal-btn-action"
                      style={{
                        padding: '5px 12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: 'var(--primary, #234B36)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                      onClick={() => onEditarVenda && onEditarVenda(ev.venda)}
                    >
                      ✏️ EDITAR VENDA
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
