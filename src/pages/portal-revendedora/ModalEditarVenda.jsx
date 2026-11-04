import React, { useState, useMemo } from 'react'
import { editarVendaPortal, definirDataRecebimentoVenda } from '../../storage'
import { formatarMoeda, calcularSaldoItemConsignado, simularValoresVenda } from './portalHelpers'
import { obterDataLocalHoje } from '../../lib/dataLocal.js'

export default function ModalEditarVenda({ venda, remessas = [], revendedora, onSalvarSucesso, onFechar }) {
  const status = (venda?.status || '').toUpperCase()
  // Desde a migração "Nova Metodologia do Portal" (20260902170000), a venda nasce já CONFIRMADA
  // (baixa de estoque imediata) — não existe mais o status AGUARDANDO_CONFERENCIA nesse fluxo.
  // A RPC editar_venda_portal_revendedora também só permite editar quando status = 'CONFIRMADA'.
  const podeEditar = status === 'CONFIRMADA' && (venda?.origem || 'PORTAL_REVENDEDORA') === 'PORTAL_REVENDEDORA'

  // Localiza o item consignado correspondente nas remessas carregadas
  const itemRemessa = useMemo(() => {
    if (!venda?.remessa_item_id) return null
    for (const rem of remessas) {
      const itens = Array.isArray(rem.itens) ? rem.itens : []
      const achado = itens.find((it) => Number(it.id) === Number(venda.remessa_item_id))
      if (achado) {
        return {
          ...achado,
          remessa_numero: rem.numero || `REM-${rem.id}`
        }
      }
    }
    return null
  }, [remessas, venda?.remessa_item_id])

  // Saldo disponível para além da quantidade já reservada por esta venda
  const saldoAdicionalDisponivel = useMemo(() => {
    if (!itemRemessa) return 0
    return calcularSaldoItemConsignado(itemRemessa)
  }, [itemRemessa])

  const maxPermitido = Number(venda?.quantidade || 1) + saldoAdicionalDisponivel

  const [quantidade, setQuantidade] = useState(venda?.quantidade || 1)
  const [precoUnitario, setPrecoUnitario] = useState(venda?.preco_unitario_vendido || '')
  const [desconto, setDesconto] = useState(venda?.valor_desconto > 0 ? String(venda.valor_desconto) : '')
  const [formaPagamento, setFormaPagamento] = useState(venda?.forma_pagamento || 'Pix')
  const [dataVenda, setDataVenda] = useState(
    venda?.data_venda ? venda.data_venda.slice(0, 10) : obterDataLocalHoje()
  )
  const dataRecebimentoOriginal = venda?.data_recebimento ? String(venda.data_recebimento).slice(0, 10) : ''
  const [dataRecebimento, setDataRecebimento] = useState(dataRecebimentoOriginal)
  const [observacao, setObservacao] = useState(venda?.observacao || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const repasseUnitario = Number(venda?.valor_repasse_unitario ?? itemRemessa?.preco_venda_sugerido ?? 0)

  const simulacao = useMemo(() => {
    const qtd = Number(quantidade || 0)
    const preco = Number(precoUnitario || 0)
    const desc = Number(desconto || 0)

    return simularValoresVenda({
      quantidade: qtd,
      precoUnitario: preco,
      precoRepasse: repasseUnitario,
      comissaoPercentual: Number(venda?.comissao_percentual ?? itemRemessa?.comissao_percentual ?? revendedora?.comissao_padrao ?? 20),
      valorDesconto: desc
    })
  }, [quantidade, precoUnitario, desconto, repasseUnitario, venda, itemRemessa, revendedora])

  if (!venda) return null

  // Previne fechar ao pressionar ESC se o formulário estiver aberto
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      e.preventDefault()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErro('')

    if (!podeEditar) {
      setErro('Esta venda não pode ser editada pois não está aguardando conferência.')
      return
    }

    const qtd = Number(quantidade)
    if (!qtd || qtd <= 0 || !Number.isInteger(qtd)) {
      setErro('Informe uma quantidade inteira válida maior que zero.')
      return
    }

    if (qtd > maxPermitido) {
      setErro(`Quantidade solicitada (${qtd}) ultrapassa o saldo disponível da remessa (${maxPermitido} un.).`)
      return
    }

    const preco = Number(precoUnitario)
    if (!preco || preco <= 0) {
      setErro('Informe um preço unitário válido maior que zero.')
      return
    }

    const desc = Number(desconto || 0)
    if (desc < 0) {
      setErro('O desconto não pode ser negativo.')
      return
    }

    const subtotal = Number((qtd * preco).toFixed(2))
    if (desc > subtotal) {
      setErro(`O desconto (${formatarMoeda(desc)}) não pode ser maior que o subtotal da venda (${formatarMoeda(subtotal)}).`)
      return
    }

    if (dataRecebimento && dataRecebimento < dataVenda) {
      setErro('O dia do recebimento não pode ser antes da data da venda.')
      return
    }

    try {
      setSalvando(true)
      const res = await editarVendaPortal({
        vendaId: venda.id,
        quantidade: qtd,
        precoUnitario: preco,
        valorDesconto: desc,
        formaPagamento,
        dataVenda,
        observacao
      })

      if (!res?.sucesso) {
        setErro(res?.mensagem || 'Erro ao atualizar a venda.')
        return
      }

      if (dataRecebimento !== dataRecebimentoOriginal) {
        const resData = await definirDataRecebimentoVenda({ vendaId: venda.id, dataRecebimento: dataRecebimento || null })
        if (!resData?.sucesso) {
          setErro(`A venda foi salva, mas a data de recebimento não: ${resData?.mensagem || 'erro'}`)
          return
        }
      }

      if (onSalvarSucesso) {
        onSalvarSucesso(res.mensagem || 'Venda atualizada com sucesso.')
      }
    } catch (err) {
      console.error('Erro ao editar venda no portal:', err)
      setErro('Erro inesperado ao salvar alterações. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="portal-modal-overlay"
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        // Clicar fora NÃO fecha o modal (regra global do projeto)
        e.stopPropagation()
      }}
    >
      <div className="portal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="portal-modal-header">
          <div>
            <h2 className="portal-modal-title">Editar Venda #{venda.id}</h2>
            <div className="portal-modal-sub">
              {podeEditar ? 'Corrija os dados da venda pendente de conferência' : 'Venda bloqueada para edição'}
            </div>
          </div>
          <button
            type="button"
            className="portal-modal-close"
            onClick={onFechar}
            disabled={salvando}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {!podeEditar ? (
          <div>
            <div style={{
              background: 'var(--danger-light, #F5E3DE)',
              color: 'var(--danger, #B85F4A)',
              padding: '14px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '16px'
            }}>
              Esta venda está com status <strong>{status}</strong>. Apenas vendas com status <strong>CONFIRMADA</strong> podem ser editadas pela revendedora.
            </div>
            <button
              type="button"
              className="portal-btn-action"
              style={{ width: '100%', padding: '10px' }}
              onClick={onFechar}
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {erro && (
              <div style={{
                background: 'var(--danger-light, #F5E3DE)',
                color: 'var(--danger, #B85F4A)',
                padding: '12px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                {erro}
              </div>
            )}

            {/* Informações fixas da peça */}
            <div style={{
              background: '#FAF7F0',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '12px 14px',
              marginBottom: '16px'
            }}>
              <strong style={{ fontSize: '14px', color: 'var(--primary)' }}>
                {venda.produto_nome}
              </strong>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {venda.numero_remessa || `REM-${venda.remessa_id}`} • Cor: {venda.cor || 'Única'} • Tam: {venda.tamanho || 'Único'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--accent, #C9A35A)', marginTop: '4px', fontWeight: 600 }}>
                Status atual: Confirmada
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div className="portal-form-group">
                <label htmlFor="pv-edit-qtd">Quantidade</label>
                <input
                  id="pv-edit-qtd"
                  type="number"
                  min="1"
                  max={maxPermitido}
                  className="portal-form-input"
                  value={quantidade}
                  onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                  required
                  disabled={salvando}
                />
                <small style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                  Máx disponível na remessa: {maxPermitido} un.
                </small>
              </div>

              <div className="portal-form-group">
                <label htmlFor="pv-edit-preco">Preço da Venda (R$)</label>
                <input
                  id="pv-edit-preco"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="portal-form-input"
                  value={precoUnitario}
                  onChange={(e) => setPrecoUnitario(e.target.value)}
                  required
                  disabled={salvando}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              {/* Valor de Repasse SOMENTE LEITURA */}
              <div className="portal-form-group">
                <label htmlFor="pv-edit-repasse">Valor de Repasse</label>
                <div className="portal-readonly-field" id="pv-edit-repasse">
                  <span style={{ fontWeight: 600 }}>{formatarMoeda(repasseUnitario)}</span>
                  <span className="portal-readonly-badge">Somente leitura</span>
                </div>
                <small style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                  Definido na remessa pelo Bazar
                </small>
              </div>

              {/* Campo Desconto em R$ */}
              <div className="portal-form-group">
                <label htmlFor="pv-edit-desconto">Desconto (R$)</label>
                <input
                  id="pv-edit-desconto"
                  type="number"
                  step="0.01"
                  min="0"
                  max={simulacao ? simulacao.subtotal : undefined}
                  className="portal-form-input"
                  placeholder="0.00"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  disabled={salvando}
                />
                <small style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                  Desconto concedido ao cliente
                </small>
              </div>
            </div>

            {/* Valor Final Calculado Automaticamente */}
            <div className="portal-form-group">
              <label htmlFor="pv-edit-final">Valor Final da Venda</label>
              <div className="portal-readonly-field" id="pv-edit-final" style={{ background: 'var(--surface)', borderColor: 'var(--primary)' }}>
                <strong style={{ color: 'var(--primary)', fontSize: '16px' }}>
                  {formatarMoeda(simulacao ? simulacao.totalVenda : 0)}
                </strong>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Calculado automaticamente</span>
              </div>
              <small style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                VALOR FINAL = VALOR ORIGINAL DA VENDA - DESCONTO
              </small>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div className="portal-form-group">
                <label htmlFor="pv-edit-forma">Forma de Pagamento</label>
                <select
                  id="pv-edit-forma"
                  className="portal-form-select"
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                  disabled={salvando}
                >
                  <option value="Pix">PIX</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cartão">Cartão</option>
                  <option value="Transferência">Transferência</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div className="portal-form-group">
                <label htmlFor="pv-edit-data">Data da Venda</label>
                <input
                  id="pv-edit-data"
                  type="date"
                  className="portal-form-input"
                  value={dataVenda}
                  onChange={(e) => setDataVenda(e.target.value)}
                  disabled={salvando}
                />
              </div>
            </div>

            <div className="portal-form-group">
              <label htmlFor="pv-edit-recebimento">Dia em que o dinheiro cai (opcional)</label>
              <input
                id="pv-edit-recebimento"
                type="date"
                className="portal-form-input"
                value={dataRecebimento}
                min={dataVenda}
                onChange={(e) => setDataRecebimento(e.target.value)}
                disabled={salvando}
              />
              <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)' }}>
                Deixe vazio se recebeu na hora. Com data, a venda só soma nos valores a partir desse dia.
              </small>
            </div>

            <div className="portal-form-group">
              <label htmlFor="pv-edit-obs">Observação (Opcional)</label>
              <input
                id="pv-edit-obs"
                type="text"
                className="portal-form-input"
                placeholder="Ex: Cliente pagou à vista com desconto..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                disabled={salvando}
              />
            </div>

            {simulacao && (
              <div className="portal-preview-box">
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)', marginBottom: '8px' }}>
                  Resumo Atualizado da Venda
                </div>
                <div className="portal-preview-row">
                  <span>Subtotal ({simulacao.quantidade} un.):</span>
                  <span>{formatarMoeda(simulacao.subtotal)}</span>
                </div>
                {simulacao.valorDesconto > 0 && (
                  <div className="portal-preview-row">
                    <span>Desconto:</span>
                    <span style={{ color: 'var(--danger, #B85F4A)' }}>- {formatarMoeda(simulacao.valorDesconto)}</span>
                  </div>
                )}
                <div className="portal-preview-row total">
                  <span>Valor Final da Venda:</span>
                  <span>{formatarMoeda(simulacao.totalVenda)}</span>
                </div>
                <div className="portal-preview-row">
                  <span>Minha Comissão Estimada:</span>
                  <span style={{ color: 'var(--accent, #C9A35A)', fontWeight: 600 }}>
                    {formatarMoeda(simulacao.comissao)}
                  </span>
                </div>
                <div className="portal-preview-row">
                  <span>Valor Devido ao Bazar:</span>
                  <span>{formatarMoeda(simulacao.valorLoja)}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                className="portal-btn-action"
                style={{ flex: 1, padding: '12px' }}
                onClick={onFechar}
                disabled={salvando}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="portal-btn-submit"
                style={{ flex: 2, margin: 0 }}
                disabled={salvando}
              >
                {salvando ? 'Salvando Alterações...' : 'SALVAR ALTERAÇÕES'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
