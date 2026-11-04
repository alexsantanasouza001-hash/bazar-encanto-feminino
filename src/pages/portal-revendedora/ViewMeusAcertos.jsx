import React, { useState, useMemo, useEffect } from 'react'
import {
  formatarMoeda,
  formatarData,
  calcularConsolidacaoFinanceira,
  filtrarVendasConsolidacao
} from './portalHelpers'
import { informarPagamentoPortal, carregarConfiguracaoPix } from '../../storage'
import { obterDataLocalHoje } from '../../lib/dataLocal.js'

export default function ViewMeusAcertos({
  vendas = [],
  remessas = [],
  pagamentos = [],
  _acertos = [],
  revendedora = null,
  _resumo = {},
  extrato = [],
  onAtualizarDados,
  _carregando = false
}) {
  // Filtros
  const [periodo, setPeriodo] = useState('todos')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [remessaSelecionada, setRemessaSelecionada] = useState('todas')

  // Modal Informar Pagamento
  const [modalPagamentoAberto, setModalPagamentoAberto] = useState(false)
  const [salvandoPagamento, setSalvandoPagamento] = useState(false)
  const [configPix, setConfigPix] = useState({ pix_chave_fixa: '', pix_beneficiario: '' })
  const [formPag, setFormPag] = useState({
    valor: '',
    dataPagamento: obterDataLocalHoje(),
    formaPagamento: 'Pix',
    tipoDestino: 'geral', // 'geral' ou 'remessa'
    remessaId: '',
    observacao: '',
    comprovanteRef: ''
  })
  const [pixCopiado, setPixCopiado] = useState(false)

  // Carrega configuração do PIX ao montar
  useEffect(() => {
    carregarConfiguracaoPix()
      .then((cfg) => {
        if (cfg) setConfigPix(cfg)
      })
      .catch((err) => console.error('Erro ao carregar PIX:', err))
  }, [])

  // Lista de remessas únicas disponíveis para o filtro
  const listaRemessasOpcoes = useMemo(() => {
    const mapa = new Map()
    for (const r of remessas) {
      if (r.id) {
        mapa.set(String(r.id), r.numero || `REM-${String(r.id).padStart(6, '0')}`)
      }
    }
    for (const v of vendas) {
      if (v.remessa_id && !mapa.has(String(v.remessa_id))) {
        mapa.set(String(v.remessa_id), v.numero_remessa || `REM-${String(v.remessa_id).padStart(6, '0')}`)
      }
    }
    return Array.from(mapa.entries()).map(([id, numero]) => ({ id, numero }))
  }, [remessas, vendas])

  // Vendas filtradas por período e remessa (exclusivamente CONFIRMADAS)
  const vendasFiltradas = useMemo(() => {
    return filtrarVendasConsolidacao({
      vendas,
      periodo,
      dataInicio,
      dataFim,
      remessaId: remessaSelecionada
    })
  }, [vendas, periodo, dataInicio, dataFim, remessaSelecionada])

  // Consolidação Financeira (MESMA REGRA DO RESUMO)
  const consolidacao = useMemo(() => {
    return calcularConsolidacaoFinanceira(vendasFiltradas, revendedora, remessas)
  }, [vendasFiltradas, revendedora, remessas])

  // Pagamentos filtrados por período e remessa
  const pagamentosFiltrados = useMemo(() => {
    return (pagamentos || []).filter((p) => {
      // Filtro por remessa
      if (remessaSelecionada && remessaSelecionada !== 'todas') {
        if (String(p.remessa_id) !== String(remessaSelecionada)) {
          return false
        }
      }

      // Filtro por período
      if (periodo && periodo !== 'todos' && p.data_pagamento) {
        const dataStr = p.data_pagamento.slice(0, 10)
        if (periodo === 'este_mes') {
          const hoje = new Date()
          const anoMesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
          if (!dataStr.startsWith(anoMesAtual)) return false
        } else if (periodo === 'mes_anterior') {
          const hoje = new Date()
          const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
          const anoMesAnterior = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          if (!dataStr.startsWith(anoMesAnterior)) return false
        } else if (periodo === 'personalizado') {
          if (dataInicio && dataStr < dataInicio) return false
          if (dataFim && dataStr > dataFim) return false
        }
      }

      return true
    })
  }, [pagamentos, remessaSelecionada, periodo, dataInicio, dataFim])

  // Total já pago e confirmado pelo Admin
  const valorJaPagoConfirmado = useMemo(() => {
    return pagamentosFiltrados
      .filter((p) => (p.status || 'CONFIRMADO') === 'CONFIRMADO')
      .reduce((acc, p) => acc + Number(p.valor_confirmado != null ? p.valor_confirmado : p.valor || 0), 0)
  }, [pagamentosFiltrados])

  // Pagamentos aguardando confirmação do Admin
  const pagamentosAguardandoConfirmacao = useMemo(() => {
    return pagamentosFiltrados.filter((p) => p.status === 'AGUARDANDO_CONFIRMACAO')
  }, [pagamentosFiltrados])

  const totalAguardandoConfirmacao = useMemo(() => {
    return pagamentosAguardandoConfirmacao.reduce(
      (acc, p) => acc + Number(p.valor_informado || p.valor || 0),
      0
    )
  }, [pagamentosAguardandoConfirmacao])

  // Saldo Pendente Oficial = Valor Total Devido ao Bazar - Pagamentos Confirmados
  const saldoPendenteOficial = useMemo(() => {
    return Math.max(0, Number((consolidacao.valorDevidoBazar - valorJaPagoConfirmado).toFixed(2)))
  }, [consolidacao.valorDevidoBazar, valorJaPagoConfirmado])

  // Saldo após confirmação de pagamentos pendentes
  const saldoAposConfirmacao = useMemo(() => {
    return Math.max(0, Number((saldoPendenteOficial - totalAguardandoConfirmacao).toFixed(2)))
  }, [saldoPendenteOficial, totalAguardandoConfirmacao])

  // Abrir modal de informar pagamento
  const handleAbrirModalPagamento = () => {
    setFormPag({
      valor: saldoPendenteOficial > 0 ? saldoPendenteOficial.toFixed(2) : '',
      dataPagamento: obterDataLocalHoje(),
      formaPagamento: 'Pix',
      tipoDestino: remessaSelecionada !== 'todas' ? 'remessa' : 'geral',
      remessaId: remessaSelecionada !== 'todas' ? remessaSelecionada : '',
      observacao: '',
      comprovanteRef: ''
    })
    setPixCopiado(false)
    setModalPagamentoAberto(true)
  }

  // Copiar chave PIX
  const handleCopiarPix = () => {
    const chave = configPix.pix_chave_fixa || 'pix@bazarencantofeminino.com.br'
    navigator.clipboard.writeText(chave)
    setPixCopiado(true)
    setTimeout(() => setPixCopiado(false), 3000)
  }

  // Submeter formulário de pagamento
  const handleSalvarPagamento = async (e) => {
    e.preventDefault()
    const val = parseFloat(formPag.valor)
    if (isNaN(val) || val <= 0) {
      alert('Por favor, informe um valor válido maior que zero.')
      return
    }

    try {
      setSalvandoPagamento(true)
      const res = await informarPagamentoPortal({
        valor: val,
        dataPagamento: formPag.dataPagamento ? new Date(formPag.dataPagamento + 'T12:00:00Z').toISOString() : new Date().toISOString(),
        formaPagamento: formPag.formaPagamento,
        remessaId: formPag.tipoDestino === 'remessa' && formPag.remessaId ? Number(formPag.remessaId) : null,
        observacao: formPag.observacao,
        comprovanteRef: formPag.comprovanteRef || null,
        idempotencyKey: `pag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      })

      if (res?.sucesso) {
        alert('Pagamento informado com sucesso! A administração do Bazar irá conferir e confirmar.')
        setModalPagamentoAberto(false)
        if (onAtualizarDados) await onAtualizarDados()
      } else {
        alert(res?.mensagem || 'Falha ao informar pagamento.')
      }
    } catch (err) {
      alert(err.message || 'Erro ao informar pagamento.')
    } finally {
      setSalvandoPagamento(false)
    }
  }

  return (
    <div>
      <div className="portal-section-title">
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontFamily: 'serif' }}>Meu Acerto Financeiro</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Consolidação das vendas confirmadas, comissões, partilha e saldo atual a repassar
          </p>
        </div>
        <button
          type="button"
          className="portal-btn-action primary"
          style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 700 }}
          onClick={handleAbrirModalPagamento}
        >
          💰 Informar Pagamento
        </button>
      </div>

      {/* BARRA DE FILTROS: PERÍODO E REMESSA */}
      <div className="portal-filtros-acertos">
        {/* FILTRO 1: PERÍODO */}
        <div className="portal-filtro-item">
          <label className="portal-filtro-label">Período</label>
          <select
            className="portal-filtro-select"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          >
            <option value="todos">Todos os períodos</option>
            <option value="este_mes">Este mês</option>
            <option value="mes_anterior">Mês anterior</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>

        {/* DATAS PERSONALIZADAS */}
        {periodo === 'personalizado' && (
          <>
            <div className="portal-filtro-item">
              <label className="portal-filtro-label">Data Inicial</label>
              <input
                type="date"
                className="portal-filtro-input"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="portal-filtro-item">
              <label className="portal-filtro-label">Data Final</label>
              <input
                type="date"
                className="portal-filtro-input"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          </>
        )}

        {/* FILTRO 2: REMESSA */}
        <div className="portal-filtro-item">
          <label className="portal-filtro-label">Remessa</label>
          <select
            className="portal-filtro-select"
            value={remessaSelecionada}
            onChange={(e) => setRemessaSelecionada(e.target.value)}
          >
            <option value="todas">Todas as Remessas</option>
            {listaRemessasOpcoes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.numero}
              </option>
            ))}
          </select>
        </div>

        {/* INDICADOR DE FILTROS ATIVOS */}
        {(periodo !== 'todos' || remessaSelecionada !== 'todas') && (
          <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', paddingBottom: '4px' }}>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--danger, #B85F4A)',
                fontSize: '12px',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
              onClick={() => {
                setPeriodo('todos')
                setDataInicio('')
                setDataFim('')
                setRemessaSelecionada('todas')
              }}
            >
              Limpar Filtros
            </button>
          </div>
        )}
      </div>

      <div className="portal-resumo-container">
        {/* CARDS PRINCIPAIS: VENDAS, COMISSÃO, CUSTO, LUCRO */}
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
            <span className="portal-resumo-card-titulo">Custo / Repasse</span>
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

        {/* BLOCO DE PARTILHA DE LUCRO (SE HOUVER DIVISÃO ESPECIAL) */}
        {consolidacao.usaDivisao && (
          <div className="portal-bloco-divisao">
            <div className="portal-bloco-divisao-header">
              <h3 className="portal-bloco-divisao-title">
                Divisão Especial do Lucro Líquido ({formatarMoeda(consolidacao.lucroLiquido)})
              </h3>
              <p className="portal-bloco-divisao-sub">
                Partilha acordada individualmente no cadastro
              </p>
            </div>

            <div className="portal-bloco-divisao-grid">
              <div className="portal-divisao-item">
                <span className="portal-divisao-item-label">
                  Participação da Revendedora ({consolidacao.percentualRevendedora}%)
                </span>
                <span className="portal-divisao-item-valor" style={{ color: 'var(--accent, #C9A35A)' }}>
                  {formatarMoeda(consolidacao.parteLucroRevendedora)}
                </span>
              </div>

              <div className="portal-divisao-item">
                <span className="portal-divisao-item-label">
                  Participação do Bazar ({consolidacao.percentualBazar}%)
                </span>
                <span className="portal-divisao-item-valor" style={{ color: 'var(--primary)' }}>
                  {formatarMoeda(consolidacao.parteLucroBazar)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CARDS FINAIS: VALOR TOTAL DEVIDO, VALOR JÁ PAGO E SALDO PENDENTE */}
        <div className="portal-bloco-finais">
          {/* VALOR A REPASSAR AO BAZAR (DESTAQUE MÁXIMO) */}
          <div className="portal-card-pago-bazar">
            <span className="portal-card-pago-bazar-titulo">
              VALOR TOTAL DEVIDO AO BAZAR
            </span>
            <span className="portal-card-pago-bazar-valor">
              {formatarMoeda(consolidacao.valorDevidoBazar)}
            </span>
            <div style={{ fontSize: '12px', color: '#E8E2D4', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div>• Custo Mercadorias: <strong>{formatarMoeda(consolidacao.custoTotal)}</strong></div>
              {consolidacao.usaDivisao && (
                <div>• Participação do Bazar no Lucro ({consolidacao.percentualBazar}%): <strong>{formatarMoeda(consolidacao.parteLucroBazar)}</strong></div>
              )}
            </div>
          </div>

          {/* VALOR JÁ PAGO E SALDO PENDENTE */}
          <div className="portal-card-ganho-rev" style={{ background: '#FAF7F0' }}>
            <div style={{ marginBottom: '14px' }}>
              <span className="portal-card-ganho-rev-titulo" style={{ display: 'block', marginBottom: '4px' }}>
                Valor Já Pago e Confirmado
              </span>
              <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--success, #56745A)' }}>
                {formatarMoeda(valorJaPagoConfirmado)}
              </span>
            </div>

            {totalAguardandoConfirmacao > 0 && (
              <div style={{
                background: '#FFF8E7',
                border: '1px solid #FFE0A3',
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '14px',
                fontSize: '12px'
              }}>
                <div style={{ color: 'var(--warning, #B8893F)', fontWeight: 700, marginBottom: '2px' }}>
                  ⏳ Pagamento Aguardando Confirmação
                </div>
                <div>Valor informado: <strong>{formatarMoeda(totalAguardandoConfirmacao)}</strong></div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Saldo após confirmação: <strong>{formatarMoeda(saldoAposConfirmacao)}</strong>
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <span className="portal-card-ganho-rev-titulo" style={{ display: 'block', marginBottom: '4px' }}>
                Saldo Pendente Oficial
              </span>
              <span style={{ fontSize: '28px', fontWeight: 800, color: saldoPendenteOficial > 0 ? 'var(--warning, #B8893F)' : 'var(--success, #56745A)' }}>
                {formatarMoeda(saldoPendenteOficial)}
              </span>
              <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                (Valor Total Devido − Pagamentos Confirmados)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO DO HISTÓRICO DE PAGAMENTOS INFORMADOS */}
      <div className="portal-section-title" style={{ marginTop: '32px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '16px', fontFamily: 'serif' }}>Histórico de Pagamentos</h2>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Acompanhe os repasses informados e a confirmação pela administração
          </p>
        </div>
        <button
          type="button"
          className="portal-btn-action"
          style={{ padding: '6px 12px', fontSize: '12px' }}
          onClick={handleAbrirModalPagamento}
        >
          ＋ Informar Novo Pagamento
        </button>
      </div>

      {pagamentosFiltrados.length === 0 ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '30px 20px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          marginBottom: '28px'
        }}>
          Nenhum pagamento registrado para o filtro selecionado.
        </div>
      ) : (
        <div className="portal-items-list" style={{ marginBottom: '28px' }}>
          {pagamentosFiltrados.map((p) => {
            const status = (p.status || 'CONFIRMADO').toUpperCase()
            const valorExibir = p.valor_confirmado != null ? p.valor_confirmado : p.valor_informado || p.valor
            return (
              <div key={p.id} className="portal-item-card">
                <div className="portal-item-info">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <strong style={{ fontSize: '14px', color: 'var(--text)' }}>
                        Repasse {p.forma_pagamento || 'Pix'}
                      </strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Informado em: {formatarData(p.data_pagamento, true)}
                      </div>
                    </div>
                    <span className={`portal-badge-status ${status === 'AGUARDANDO_CONFIRMACAO' ? 'pendente' : status === 'RECUSADO' ? 'recusada' : 'confirmada'}`}>
                      {status === 'AGUARDANDO_CONFIRMACAO' ? 'Aguardando Confirmação' : status === 'RECUSADO' ? 'Recusado' : 'Confirmado'}
                    </span>
                  </div>

                  <div className="portal-item-tags" style={{ marginTop: '8px' }}>
                    {p.remessa_id && (
                      <span className="portal-tag">
                        Remessa: #{p.remessa_id}
                      </span>
                    )}
                    <span className="portal-tag">
                      {p.forma_pagamento || 'Pix'}
                    </span>
                    {status === 'CONFIRMADO' && p.confirmado_em && (
                      <span className="portal-tag" style={{ color: 'var(--success)', fontWeight: 600 }}>
                        Confirmado em: {formatarData(p.confirmado_em, true)}
                      </span>
                    )}
                  </div>

                  {p.observacao && (
                    <div style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--text-secondary)', marginTop: '6px' }}>
                      "{p.observacao}"
                    </div>
                  )}

                  {status === 'RECUSADO' && p.motivo_recusa && (
                    <div style={{ fontSize: '12px', color: 'var(--danger, #B85F4A)', marginTop: '6px', fontWeight: 600 }}>
                      Motivo da recusa: {p.motivo_recusa}
                    </div>
                  )}

                  <div className="portal-item-stats" style={{ marginTop: '10px' }}>
                    <span>Valor: <strong style={{ fontSize: '16px', color: status === 'CONFIRMADO' ? 'var(--success)' : status === 'RECUSADO' ? 'var(--danger)' : 'var(--warning, #B8893F)' }}>{formatarMoeda(valorExibir)}</strong></span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* SEÇÃO DO EXTRATO DETALHADO */}
      <div className="portal-section-title">
        <div>
          <h2 style={{ margin: 0, fontSize: '16px', fontFamily: 'serif' }}>Extrato Detalhado (Conta Corrente)</h2>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Linha do tempo de débitos e créditos confirmados
          </p>
        </div>
      </div>

      {extrato.length === 0 ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '30px 20px',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          Nenhum lançamento registrado até o momento.
        </div>
      ) : (
        <div className="portal-extrato-card">
          {extrato.map((item) => (
            <div key={item.id} className="portal-extrato-item">
              <div className="portal-extrato-desc">
                <strong>{item.descricao}</strong>
                <span>{formatarData(item.data, true)}</span>
              </div>
              <div className="portal-extrato-valores">
                {item.credito > 0 ? (
                  <div className="portal-extrato-valor credito">
                    + {formatarMoeda(item.credito)}
                  </div>
                ) : (
                  <div className="portal-extrato-valor debito">
                    - {formatarMoeda(item.debito)}
                  </div>
                )}
                <span className="portal-extrato-saldo">
                  Saldo: {formatarMoeda(item.saldoApos)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: INFORMAR PAGAMENTO */}
      {modalPagamentoAberto && (
        <div className="portal-modal-overlay">
          <div className="portal-modal-content" style={{ maxWidth: '520px' }}>
            <div className="portal-modal-header">
              <h2 className="portal-modal-title">Informar Pagamento ao Bazar</h2>
              <button
                type="button"
                className="portal-modal-close"
                onClick={() => setModalPagamentoAberto(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSalvarPagamento} className="portal-form">
              {/* CHAVE PIX DO BAZAR */}
              <div style={{
                background: '#FAF7F0',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: '6px' }}>
                  Chave Pix do Bazar Encanto Feminino
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <code style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>
                    {configPix.pix_chave_fixa || 'pix@bazarencantofeminino.com.br'}
                  </code>
                  <button
                    type="button"
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: pixCopiado ? 'var(--success)' : 'var(--primary)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                    onClick={handleCopiarPix}
                  >
                    {pixCopiado ? '✓ Copiado!' : 'Copiar Chave'}
                  </button>
                </div>
                {configPix.pix_beneficiario && (
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Beneficiário: {configPix.pix_beneficiario}
                  </div>
                )}
              </div>

              {/* SALDO DEVIDO ATUAL */}
              <div style={{
                background: '#F7F3EB',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '13px'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>Saldo Devido Atual:</span>
                <strong style={{ fontSize: '15px', color: 'var(--primary)' }}>{formatarMoeda(saldoPendenteOficial)}</strong>
              </div>

              {/* TIPO DE DESTINO (GERAL OU REMESSA) */}
              <div className="portal-form-group">
                <label className="portal-form-label">Referente a:</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    style={{
                      padding: '8px',
                      fontSize: '13px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      background: formPag.tipoDestino === 'geral' ? 'var(--primary)' : '#fff',
                      color: formPag.tipoDestino === 'geral' ? '#fff' : 'var(--text)',
                      cursor: 'pointer',
                      fontWeight: formPag.tipoDestino === 'geral' ? 700 : 500
                    }}
                    onClick={() => setFormPag({ ...formPag, tipoDestino: 'geral', remessaId: '' })}
                  >
                    Saldo Geral
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: '8px',
                      fontSize: '13px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      background: formPag.tipoDestino === 'remessa' ? 'var(--primary)' : '#fff',
                      color: formPag.tipoDestino === 'remessa' ? '#fff' : 'var(--text)',
                      cursor: 'pointer',
                      fontWeight: formPag.tipoDestino === 'remessa' ? 700 : 500
                    }}
                    onClick={() => setFormPag({ ...formPag, tipoDestino: 'remessa' })}
                  >
                    Remessa Específica
                  </button>
                </div>
              </div>

              {formPag.tipoDestino === 'remessa' && (
                <div className="portal-form-group">
                  <label className="portal-form-label">Selecione a Remessa:</label>
                  <select
                    className="portal-form-input"
                    value={formPag.remessaId}
                    required
                    onChange={(e) => setFormPag({ ...formPag, remessaId: e.target.value })}
                  >
                    <option value="">Selecione uma remessa...</option>
                    {listaRemessasOpcoes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.numero}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* VALOR DO PAGAMENTO */}
              <div className="portal-form-group">
                <label className="portal-form-label">Valor do Pagamento (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0,00"
                  className="portal-form-input"
                  style={{ fontSize: '18px', fontWeight: 700 }}
                  value={formPag.valor}
                  onChange={(e) => setFormPag({ ...formPag, valor: e.target.value })}
                />
                <small style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                  Pode ser o valor total ou parcial.
                </small>
              </div>

              {/* DATA E FORMA DE PAGAMENTO */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="portal-form-group">
                  <label className="portal-form-label">Data do Pagamento *</label>
                  <input
                    type="date"
                    required
                    className="portal-form-input"
                    value={formPag.dataPagamento}
                    onChange={(e) => setFormPag({ ...formPag, dataPagamento: e.target.value })}
                  />
                </div>
                <div className="portal-form-group">
                  <label className="portal-form-label">Forma de Pagamento</label>
                  <select
                    className="portal-form-input"
                    value={formPag.formaPagamento}
                    onChange={(e) => setFormPag({ ...formPag, formaPagamento: e.target.value })}
                  >
                    <option value="Pix">Pix</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
              </div>

              {/* OBSERVAÇÃO */}
              <div className="portal-form-group">
                <label className="portal-form-label">Observação / Informações Adicionais</label>
                <textarea
                  rows="2"
                  className="portal-form-input"
                  placeholder="Ex: PIX enviado da conta de Maria Silva"
                  value={formPag.observacao}
                  onChange={(e) => setFormPag({ ...formPag, observacao: e.target.value })}
                />
              </div>

              <div className="portal-form-actions">
                <button
                  type="button"
                  className="portal-btn-secondary"
                  disabled={salvandoPagamento}
                  onClick={() => setModalPagamentoAberto(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="portal-btn-primary"
                  disabled={salvandoPagamento}
                >
                  {salvandoPagamento ? 'Enviando...' : 'Confirmar Envio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
