import React, { useState, useMemo } from 'react'
import { formatarMoeda, formatarData, calcularConsolidacaoFinanceira } from './portalHelpers'
import { vendaAguardandoRecebimento } from '../../lib/recebimentoVenda.js'

export default function ViewMinhasVendas({ vendas = [], remessas = [], revendedora = null, onNovaVenda, onEditarVenda, onCancelarVenda, _carregando }) {
  const [filtro, setFiltro] = useState('todas')

  const consolidacao = useMemo(() => {
    return calcularConsolidacaoFinanceira(vendas, revendedora, remessas)
  }, [vendas, revendedora, remessas])

  const vendasFiltradas = useMemo(() => {
    if (filtro === 'todas') return vendas
    if (filtro === 'RESUMO') return []
    return vendas.filter((v) => (v.status || 'CONFIRMADA').toUpperCase() === filtro)
  }, [vendas, filtro])

  return (
    <div>
      <div className="portal-section-title">
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontFamily: 'serif' }}>Minhas Vendas</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Acompanhe o status, comissões e a consolidação financeira de suas vendas
          </p>
        </div>
        <button
          type="button"
          className="portal-btn-action primary"
          style={{ padding: '8px 14px', fontSize: '13px' }}
          onClick={onNovaVenda}
        >
          ＋ Nova Venda
        </button>
      </div>

      {/* ABAS DE NAVEGAÇÃO / STATUS */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '16px' }}>
        <button
          type="button"
          className={`portal-tag ${filtro === 'todas' ? 'active' : ''}`}
          style={{
            cursor: 'pointer',
            padding: '6px 12px',
            fontSize: '12px',
            border: '1px solid var(--border)',
            background: filtro === 'todas' ? 'var(--primary)' : 'var(--surface)',
            color: filtro === 'todas' ? '#fff' : 'var(--text)'
          }}
          onClick={() => setFiltro('todas')}
        >
          Todas ({vendas.length})
        </button>

        <button
          type="button"
          style={{
            cursor: 'pointer',
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            background: filtro === 'CONFIRMADA' ? 'var(--success, #56745A)' : 'var(--surface)',
            color: filtro === 'CONFIRMADA' ? '#fff' : 'var(--text)'
          }}
          onClick={() => setFiltro('CONFIRMADA')}
        >
          🟢 Confirmadas ({vendas.filter((v) => (v.status || 'CONFIRMADA') === 'CONFIRMADA').length})
        </button>

        {vendas.some((v) => v.status === 'CANCELADA') && (
          <button
            type="button"
            style={{
              cursor: 'pointer',
              padding: '6px 12px',
              fontSize: '12px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: filtro === 'CANCELADA' ? '#6E746B' : 'var(--surface)',
              color: filtro === 'CANCELADA' ? '#fff' : 'var(--text)'
            }}
            onClick={() => setFiltro('CANCELADA')}
          >
            ⚪ Canceladas ({vendas.filter((v) => v.status === 'CANCELADA').length})
          </button>
        )}

        {vendas.some((v) => v.status === 'RECUSADA') && (
          <button
            type="button"
            style={{
              cursor: 'pointer',
              padding: '6px 12px',
              fontSize: '12px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: filtro === 'RECUSADA' ? 'var(--danger, #B85F4A)' : 'var(--surface)',
              color: filtro === 'RECUSADA' ? '#fff' : 'var(--text)'
            }}
            onClick={() => setFiltro('RECUSADA')}
          >
            🔴 Recusadas ({vendas.filter((v) => v.status === 'RECUSADA').length})
          </button>
        )}

        {/* NOVA ABA AO LADO DE RECUSADAS: RESUMO / RESULTADO */}
        <button
          type="button"
          style={{
            cursor: 'pointer',
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: 700,
            borderRadius: '4px',
            border: '1px solid var(--border)',
            background: filtro === 'RESUMO' ? 'var(--primary, #234B36)' : 'var(--surface)',
            color: filtro === 'RESUMO' ? '#ffffff' : 'var(--primary, #234B36)',
            boxShadow: filtro === 'RESUMO' ? '0 2px 6px rgba(35, 75, 54, 0.2)' : 'none'
          }}
          onClick={() => setFiltro('RESUMO')}
        >
          📊 RESUMO
        </button>
      </div>

      {/* CONTEÚDO DA ABA RESUMO */}
      {filtro === 'RESUMO' ? (
        <div className="portal-resumo-container">
          <div className="portal-resumo-banner">
            <div>
              <h2 className="portal-resumo-banner-titulo">
                Consolidação Financeira da Operação
              </h2>
              <div className="portal-resumo-banner-sub">
                Baseado exclusivamente nas {consolidacao.quantidadeVendasConfirmadas} venda(s) confirmada(s)
              </div>
            </div>
            {consolidacao.usaDivisao ? (
              <span className="portal-tag" style={{ background: '#E2EBE3', color: '#56745A', fontWeight: 600 }}>
                Partilha de Lucro: Revendedora {consolidacao.percentualRevendedora}% • Bazar {consolidacao.percentualBazar}%
              </span>
            ) : (
              <span className="portal-tag">
                Regra Padrão de Consignação
              </span>
            )}
          </div>

          {/* CARDS DE VALORES PRINCIPAIS */}
          <div className="portal-resumo-grid">
            <div className="portal-resumo-card">
              <span className="portal-resumo-card-titulo">Total de Vendas</span>
              <span className="portal-resumo-card-valor" style={{ color: 'var(--primary)' }}>
                {formatarMoeda(consolidacao.totalVendas)}
              </span>
            </div>

            <div className="portal-resumo-card comissao">
              <span className="portal-resumo-card-titulo">Comissão Total</span>
              <span className="portal-resumo-card-valor">
                {formatarMoeda(consolidacao.comissaoTotal)}
              </span>
            </div>

            <div className="portal-resumo-card">
              <span className="portal-resumo-card-titulo">Custo Total</span>
              <span className="portal-resumo-card-valor">
                {formatarMoeda(consolidacao.custoTotal)}
              </span>
            </div>

            <div className="portal-resumo-card lucro">
              <span className="portal-resumo-card-titulo">Lucro Líquido</span>
              <span className="portal-resumo-card-valor">
                {formatarMoeda(consolidacao.lucroLiquido)}
              </span>
            </div>
          </div>

          {/* DIVISÃO DO LUCRO LÍQUIDO (SE CONFIGURADA PARA A REVENDEDORA) */}
          {consolidacao.usaDivisao && (
            <div className="portal-bloco-divisao">
              <div className="portal-bloco-divisao-header">
                <h3 className="portal-bloco-divisao-title">
                  Divisão do Lucro Líquido ({formatarMoeda(consolidacao.lucroLiquido)})
                </h3>
                <p className="portal-bloco-divisao-sub">
                  Partilha configurada individualmente no cadastro da revendedora
                </p>
              </div>

              <div className="portal-bloco-divisao-grid">
                <div className="portal-divisao-item">
                  <span className="portal-divisao-item-label">
                    Parte da Revendedora ({consolidacao.percentualRevendedora}%)
                  </span>
                  <span className="portal-divisao-item-valor" style={{ color: 'var(--accent, #C9A35A)' }}>
                    {formatarMoeda(consolidacao.parteLucroRevendedora)}
                  </span>
                </div>

                <div className="portal-divisao-item">
                  <span className="portal-divisao-item-label">
                    Parte do Bazar ({consolidacao.percentualBazar}%)
                  </span>
                  <span className="portal-divisao-item-valor" style={{ color: 'var(--primary)' }}>
                    {formatarMoeda(consolidacao.parteLucroBazar)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* CONSOLIDAÇÃO FINAL: GANHO REVENDEDORA & VALOR A PAGAR AO BAZAR */}
          <div className="portal-bloco-finais">
            {/* Total que fica com a revendedora */}
            <div className="portal-card-ganho-rev">
              <span className="portal-card-ganho-rev-titulo">
                Total da Revendedora
              </span>
              <span className="portal-card-ganho-rev-valor">
                {formatarMoeda(consolidacao.totalRevendedora)}
              </span>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>• Comissão Total: <strong>{formatarMoeda(consolidacao.comissaoTotal)}</strong></div>
                {consolidacao.usaDivisao && (
                  <div>• Participação no Lucro ({consolidacao.percentualRevendedora}%): <strong>{formatarMoeda(consolidacao.parteLucroRevendedora)}</strong></div>
                )}
              </div>
            </div>

            {/* VALOR A SER PAGO AO BAZAR (DESTAQUE MÁXIMO) */}
            <div className="portal-card-pago-bazar">
              <span className="portal-card-pago-bazar-titulo">
                VALOR A SER PAGO AO BAZAR
              </span>
              <span className="portal-card-pago-bazar-valor">
                {formatarMoeda(consolidacao.valorDevidoBazar)}
              </span>
              <div style={{ fontSize: '12px', color: '#E8E2D4', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>• Custo / Repasse Mercadorias: <strong>{formatarMoeda(consolidacao.custoTotal)}</strong></div>
                {consolidacao.usaDivisao && (
                  <div>• Participação do Bazar no Lucro ({consolidacao.percentualBazar}%): <strong>{formatarMoeda(consolidacao.parteLucroBazar)}</strong></div>
                )}
              </div>
            </div>
          </div>

          {/* REGRA DE CONFERÊNCIA MATEMÁTICA */}
          <div className="portal-fechamento-box">
            <span>
              Conferência: Revendedora ({formatarMoeda(consolidacao.totalRevendedora)}) + Bazar ({formatarMoeda(consolidacao.valorDevidoBazar)})
            </span>
            <strong style={{ color: 'var(--success, #56745A)' }}>
              = {formatarMoeda(consolidacao.totalVendas)} (100% Fechado)
            </strong>
          </div>
        </div>
      ) : (
        /* CONTEÚDO DAS ABAS DE VENDAS (TODAS, PENDENTES, CONFIRMADAS, RECUSADAS) */
        <div>
          {vendasFiltradas.length === 0 ? (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--text-secondary)'
            }}>
              <p style={{ fontSize: '16px', margin: 0 }}>Nenhuma venda encontrada para este filtro.</p>
            </div>
          ) : (
            <div className="portal-items-list">
              {vendasFiltradas.map((v) => {
                const status = (v.status || 'CONFIRMADA').toUpperCase()
                const total = v.total_venda != null ? v.total_venda : v.valor_total_bruto
                const podeAcoes = status === 'CONFIRMADA'
                return (
                  <div key={v.id} className="portal-item-card">
                    <div className="portal-item-info">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <span className="portal-item-title">{v.produto_nome}</span>
                        <span className={`portal-badge-status ${status === 'CANCELADA' ? 'cancelada' : status === 'RECUSADA' ? 'recusada' : 'confirmada'}`}>
                          {status === 'CANCELADA' ? 'Cancelada' : status === 'RECUSADA' ? 'Recusada' : 'Confirmada'}
                        </span>
                      </div>

                      <div className="portal-item-tags">
                        <span className="portal-tag">
                          {v.numero_remessa || `REM-${v.remessa_id}`}
                        </span>
                        {v.cor && <span className="portal-tag">{v.cor}</span>}
                        {v.tamanho && <span className="portal-tag">Tam: {v.tamanho}</span>}
                        <span className="portal-tag">{v.quantidade} un.</span>
                        <span className="portal-tag">{v.forma_pagamento || 'Pix'}</span>
                        <span className="portal-tag">{formatarData(v.data_venda)}</span>
                        {v.data_recebimento && (
                          vendaAguardandoRecebimento(v) ? (
                            <span className="portal-tag" style={{ background: '#F6EBD9', color: '#8A6327', fontWeight: 600 }}>
                              ⏳ Dinheiro cai em {String(v.data_recebimento).slice(0, 10).split('-').reverse().join('/')}
                            </span>
                          ) : (
                            <span className="portal-tag">
                              Recebida em {String(v.data_recebimento).slice(0, 10).split('-').reverse().join('/')}
                            </span>
                          )
                        )}
                        {Number(v.valor_desconto || 0) > 0 && (
                          <span className="portal-tag" style={{ color: 'var(--danger, #B85F4A)', fontWeight: 600 }}>
                            Desc: -{formatarMoeda(v.valor_desconto)}
                          </span>
                        )}
                      </div>

                      {v.observacao && (
                        <div style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                          "{v.observacao}"
                        </div>
                      )}

                      {v.motivo_recusa && status === 'RECUSADA' && (
                        <div style={{ fontSize: '12px', color: 'var(--danger)', marginBottom: '6px' }}>
                          Motivo da recusa: {v.motivo_recusa}
                        </div>
                      )}

                      <div className="portal-item-stats">
                        <span>Total: <strong>{formatarMoeda(total)}</strong></span>
                        <span>Minha Comissão: <strong style={{ color: 'var(--accent, #C9A35A)' }}>{formatarMoeda(v.valor_comissao)}</strong></span>
                        <span>Valor Bazar: <strong>{formatarMoeda(v.valor_loja)}</strong></span>
                      </div>

                      {podeAcoes && (
                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            type="button"
                            className="portal-btn-action"
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              background: 'transparent',
                              color: 'var(--danger, #B85F4A)',
                              border: '1px solid var(--danger, #B85F4A)',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                            onClick={() => onCancelarVenda && onCancelarVenda(v)}
                          >
                            🚫 Cancelar Venda
                          </button>
                          <button
                            type="button"
                            className="portal-btn-action"
                            style={{
                              padding: '6px 14px',
                              fontSize: '12px',
                              fontWeight: 600,
                              background: 'var(--primary, #234B36)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                            onClick={() => onEditarVenda && onEditarVenda(v)}
                          >
                            ✏️ Editar Venda
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
