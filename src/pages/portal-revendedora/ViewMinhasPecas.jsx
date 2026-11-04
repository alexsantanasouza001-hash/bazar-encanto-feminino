import { useState, useMemo } from 'react'
import { formatarMoeda, formatarData, agruparPecasPortalPorProdutoVariacaoRemessa, resolverImagemProdutoRevenda } from './portalHelpers'

export default function ViewMinhasPecas({ remessas, _onRegistrarVenda, _carregando }) {
  const [busca, setBusca] = useState('')
  const [remessaFiltro, setRemessaFiltro] = useState('todas')
  const [errosFoto, setErrosFoto] = useState({})

  const gruposPecas = useMemo(() => {
    return agruparPecasPortalPorProdutoVariacaoRemessa(remessas, busca, remessaFiltro)
  }, [remessas, busca, remessaFiltro])

  return (
    <div>
      <div className="portal-section-title">
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontFamily: 'serif' }}>Minhas Peças & Remessas</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Peças agrupadas por modelo e cor sob sua responsabilidade
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <input
          type="text"
          className="portal-form-input"
          placeholder="Buscar modelo por nome, SKU, cor ou tamanho..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ flex: 1, minWidth: '220px' }}
        />

        <select
          className="portal-form-select"
          value={remessaFiltro}
          onChange={(e) => setRemessaFiltro(e.target.value)}
          style={{ width: 'auto', minWidth: '180px' }}
        >
          <option value="todas">Todas as Remessas ({remessas?.length || 0})</option>
          {(Array.isArray(remessas) ? remessas : []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.numero} ({formatarData(r.data_envio)})
            </option>
          ))}
        </select>
      </div>

      {gruposPecas.length === 0 ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          <p style={{ fontSize: '16px', margin: 0 }}>Nenhuma peça encontrada.</p>
        </div>
      ) : (
        <div className="portal-items-list">
          {gruposPecas.map((grupo) => {
            const fotoUrl = resolverImagemProdutoRevenda(grupo)
            const temErroFoto = errosFoto[grupo.chave]

            return (
              <div key={grupo.chave} className="portal-item-card portal-item-card-agrupado">
                <div className="portal-card-corpo">
                  {/* FOTO DO PRODUTO */}
                  <div className="portal-card-foto-wrap">
                    {fotoUrl && !temErroFoto ? (
                      <img
                        src={fotoUrl}
                        alt={grupo.produto_nome}
                        className="portal-card-foto-img"
                        onError={() => setErrosFoto((prev) => ({ ...prev, [grupo.chave]: true }))}
                      />
                    ) : (
                      <div className="portal-card-foto-placeholder">
                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Sem foto</span>
                      </div>
                    )}
                  </div>

                {/* DETALHES DO PRODUTO */}
                <div className="portal-item-info">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="portal-item-title">{grupo.produto_nome}</span>
                    <span className={`portal-badge-disp ${grupo.total_disponivel > 0 ? 'disponivel' : 'zerado'}`}>
                      {grupo.total_disponivel} {grupo.total_disponivel === 1 ? 'peça disp.' : 'peças disp.'}
                    </span>
                  </div>

                  <div className="portal-item-tags" style={{ marginTop: '6px' }}>
                    <span className="portal-tag">
                      {grupo.remessa_numero}
                    </span>
                    {grupo.cor && (
                      <span className="portal-tag">
                        {grupo.cor_hex && (
                          <span className="portal-tag-color-dot" style={{ backgroundColor: grupo.cor_hex }} />
                        )}
                        {grupo.cor}
                      </span>
                    )}
                    {grupo.sku && (
                      <span className="portal-tag">SKU: {grupo.sku}</span>
                    )}
                    <span className="portal-tag" style={{ background: '#f8fafc', color: 'var(--primary)', fontWeight: 600 }}>
                      Repasse: {formatarMoeda(grupo.preco_venda_sugerido)}
                    </span>
                  </div>

                  {/* GRADE DE TAMANHOS */}
                  <div className="portal-grade-container">
                    <div className="portal-grade-titulo">Disponibilidade por Tamanho:</div>
                    <div className="portal-grade-cards-grid">
                      {grupo.tamanhos.map((t) => (
                        <div key={t.id || t.tamanho} className={`portal-tam-card ${t.disponivel > 0 ? 'tem-disp' : 'sem-disp'}`}>
                          <div className="tam-badge">{t.tamanho}</div>
                          <div className="tam-metricas">
                            <span className="tam-disp-destaque">{t.disponivel} disp.</span>
                            <span className="tam-detalhes">{t.recebido} rec. • {t.vendido} vend.</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* RESUMO TOTAL DO GRUPO */}
                  <div className="portal-item-stats" style={{ marginTop: '12px', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                    <span>Recebidas: <strong>{grupo.total_recebido} un.</strong></span>
                    <span>Vendidas: <strong>{grupo.total_vendido} un.</strong></span>
                    {grupo.total_reservado > 0 && (
                      <span style={{ color: 'var(--warning, #B8893F)' }}>
                        Em conferência: <strong>{grupo.total_reservado} un.</strong>
                      </span>
                    )}
                    <span>Total com você: <strong style={{ color: 'var(--primary)' }}>{grupo.total_disponivel} un.</strong></span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        </div>
      )}
    </div>
  )
}
