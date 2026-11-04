import { useState, useMemo } from 'react'
import { registrarVendaPortal, definirDataRecebimentoVenda } from '../../storage'
import { formatarMoeda, agruparProdutosParaVenda, simularValoresVenda, resolverImagemProdutoRevenda } from './portalHelpers'
import { obterDataLocalHoje } from '../../lib/dataLocal.js'

export default function ViewRegistrarVenda({ revendedora, remessas, onVendaSucesso }) {
  const [termoBusca, setTermoBusca] = useState('')
  const [dropdownAberto, setDropdownAberto] = useState(false)
  const [grupoSelecionado, setGrupoSelecionado] = useState(null)
  const [pecaSelecionada, setPecaSelecionada] = useState(null)
  const [quantidade, setQuantidade] = useState(1)
  const [precoUnitario, setPrecoUnitario] = useState('')
  const [descontoMonetario, setDescontoMonetario] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('Pix')
  const [dataVenda, setDataVenda] = useState(obterDataLocalHoje())
  const [recebeDepois, setRecebeDepois] = useState(false)
  const [dataRecebimento, setDataRecebimento] = useState('')
  const [observacao, setObservacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroForm, setErroForm] = useState('')
  const [errosFoto, setErrosFoto] = useState({})

  const produtosAgrupados = useMemo(() => {
    return agruparProdutosParaVenda(remessas, termoBusca)
  }, [remessas, termoBusca])

  const handleSelecionarGrupo = (grupo) => {
    setGrupoSelecionado(grupo)
    setDropdownAberto(false)
    setTermoBusca('')
    setErroForm('')

    const tamanhosComEstoque = (grupo.tamanhos || []).filter((t) => (t.disponivel_venda || 0) > 0)
    if (tamanhosComEstoque.length === 1) {
      handleSelecionarTamanho(tamanhosComEstoque[0], grupo)
    } else {
      setPecaSelecionada(null)
      setQuantidade(1)
      setPrecoUnitario(grupo.preco_venda_sugerido || '')
    }
  }

  const handleSelecionarTamanho = (tamObj, grupo = grupoSelecionado) => {
    if (!tamObj || (tamObj.disponivel_venda || 0) <= 0) return

    const pecaCompleta = {
      ...tamObj,
      produto_nome: grupo.produto_nome,
      sku: grupo.sku,
      cor: grupo.cor,
      remessa_numero: grupo.remessa_numero,
      foto_variacao: grupo.foto_variacao,
      foto_produto: grupo.foto_produto,
      foto: grupo.foto
    }

    setPecaSelecionada(pecaCompleta)
    setQuantidade(1)
    setPrecoUnitario(tamObj.preco_venda_sugerido || grupo.preco_venda_sugerido || '')
    setDescontoMonetario('')
    setErroForm('')
  }

  const handleLimparSelecao = () => {
    setGrupoSelecionado(null)
    setPecaSelecionada(null)
    setQuantidade(1)
    setPrecoUnitario('')
    setDescontoMonetario('')
    setTermoBusca('')
    setErroForm('')
  }

  const repasseUnitario = Number(pecaSelecionada?.preco_venda_sugerido || grupoSelecionado?.preco_venda_sugerido || 0)

  const simulacao = useMemo(() => {
    if (!pecaSelecionada) return null
    return simularValoresVenda({
      quantidade,
      precoUnitario: Number(precoUnitario || 0),
      precoRepasse: repasseUnitario,
      comissaoPercentual: Number(pecaSelecionada.comissao_percentual ?? revendedora?.comissao_padrao ?? 20),
      valorDesconto: Number(descontoMonetario || 0)
    })
  }, [pecaSelecionada, quantidade, precoUnitario, repasseUnitario, descontoMonetario, revendedora])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErroForm('')

    if (!grupoSelecionado) {
      setErroForm('Por favor, selecione um produto para registrar a venda.')
      return
    }

    if (!pecaSelecionada) {
      setErroForm('Por favor, selecione o tamanho vendido.')
      return
    }

    const qtd = Number(quantidade)
    if (!qtd || qtd <= 0 || !Number.isInteger(qtd)) {
      setErroForm('Informe uma quantidade inteira válida maior que zero.')
      return
    }

    if (qtd > pecaSelecionada.disponivel_venda) {
      setErroForm(`Quantidade (${qtd}) maior que a quantidade disponível com você para o tamanho ${pecaSelecionada.tamanho} (${pecaSelecionada.disponivel_venda} un.).`)
      return
    }

    const preco = Number(precoUnitario)
    if (!preco || preco <= 0) {
      setErroForm('Informe um valor de venda unitário válido maior que zero.')
      return
    }

    const desc = Number(descontoMonetario || 0)
    if (desc < 0) {
      setErroForm('O desconto não pode ser negativo.')
      return
    }

    const subtotal = Number((qtd * preco).toFixed(2))
    if (desc > subtotal) {
      setErroForm(`O desconto (${formatarMoeda(desc)}) não pode ser maior que o valor da venda (${formatarMoeda(subtotal)}).`)
      return
    }

    if (recebeDepois) {
      if (!dataRecebimento) {
        setErroForm('Informe o dia em que o dinheiro vai cair.')
        return
      }
      if (dataRecebimento < dataVenda) {
        setErroForm('O dia do recebimento não pode ser antes da data da venda.')
        return
      }
    }

    try {
      setEnviando(true)
      const idempotencyKey = `portal-${revendedora.id}-${pecaSelecionada.id}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

      const res = await registrarVendaPortal({
        remessaItemId: pecaSelecionada.id,
        quantidade: qtd,
        precoUnitario: preco,
        valorDesconto: desc,
        formaPagamento,
        dataVenda,
        observacao,
        idempotencyKey
      })

      if (!res?.sucesso) {
        setErroForm(res?.mensagem || 'Erro ao registrar venda.')
        return
      }

      if (recebeDepois && dataRecebimento) {
        const resData = await definirDataRecebimentoVenda({ vendaId: res.venda_id, dataRecebimento })
        if (!resData?.sucesso) {
          if (onVendaSucesso) {
            onVendaSucesso(`Venda registrada, mas a data de recebimento não foi salva (${resData?.mensagem || 'erro'}). Abra a venda em "Minhas Vendas" e edite a data.`)
          }
          return
        }
      }

      if (onVendaSucesso) {
        onVendaSucesso(
          recebeDepois && dataRecebimento
            ? `Venda registrada. Ela entra nos valores no dia ${dataRecebimento.split('-').reverse().join('/')}, quando o dinheiro cair.`
            : 'Venda registrada com sucesso. Informe ao Bazar para realizar a conferência.'
        )
      }
    } catch (err) {
      console.error('Erro ao registrar venda:', err)
      setErroForm('Erro inesperado ao registrar venda. Verifique sua conexão.')
    } finally {
      setEnviando(false)
    }
  }

  const fotoGrupoUrl = grupoSelecionado ? resolverImagemProdutoRevenda(grupoSelecionado) : null

  return (
    <div>
      <div className="portal-section-title">
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontFamily: 'serif' }}>Registrar Venda</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Lance a venda das peças que estão com você para conferência do Bazar
          </p>
        </div>
      </div>

      <div className="portal-form-card">
        {erroForm && (
          <div style={{
            background: 'var(--danger-light, #F5E3DE)',
            color: 'var(--danger, #B85F4A)',
            padding: '12px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '16px'
          }}>
            {erroForm}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* CAMPO DE BUSCA DE PRODUTO */}
          <div className="portal-form-group">
            <label>Pesquisar Modelo para Venda</label>
            <div className="portal-search-box">
              <input
                type="text"
                className="portal-form-input"
                placeholder={grupoSelecionado ? `${grupoSelecionado.produto_nome} (${grupoSelecionado.remessa_numero})` : "Buscar modelo por nome, SKU ou cor..."}
                value={termoBusca}
                onChange={(e) => {
                  setTermoBusca(e.target.value)
                  setDropdownAberto(true)
                }}
                onFocus={() => setDropdownAberto(true)}
              />

              {dropdownAberto && (
                <div className="portal-search-dropdown">
                  {produtosAgrupados.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Nenhum modelo disponível com você encontrado.
                    </div>
                  ) : (
                    produtosAgrupados.map((p) => {
                      const fotoUrl = resolverImagemProdutoRevenda(p)
                      const temErroFoto = errosFoto[p.chave]

                      return (
                        <div
                          key={p.chave}
                          className="portal-search-item"
                          onClick={() => handleSelecionarGrupo(p)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div className="portal-search-item-foto">
                              {fotoUrl && !temErroFoto ? (
                                <img
                                  src={fotoUrl}
                                  alt={p.produto_nome}
                                  onError={() => setErrosFoto((prev) => ({ ...prev, [p.chave]: true }))}
                                />
                              ) : (
                                <span style={{ fontSize: '10px', color: '#94a3b8' }}>👗</span>
                              )}
                            </div>
                            <div>
                              <strong style={{ fontSize: '14px', color: '#1e293b' }}>{p.produto_nome}</strong>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span className="portal-tag" style={{ fontSize: '10px', padding: '1px 5px' }}>{p.remessa_numero}</span>
                                {p.cor && (
                                  <span className="portal-tag" style={{ fontSize: '10px', padding: '1px 5px' }}>
                                    {p.cor_hex && <span className="portal-tag-color-dot" style={{ backgroundColor: p.cor_hex }} />}
                                    {p.cor}
                                  </span>
                                )}
                                {p.sku && <span>SKU: {p.sku}</span>}
                              </div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span className="portal-badge-disp">{p.total_disponivel} disp.</span>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              Repasse: {formatarMoeda(p.preco_venda_sugerido)}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* CARD DO PRODUTO SELECIONADO & GRADE DE TAMANHOS */}
          {grupoSelecionado && (
            <div className="portal-produto-selecionado-box">
              <div className="portal-prod-sel-topo">
                <div className="portal-prod-sel-info-left">
                  <div className="portal-card-foto-wrap" style={{ width: '52px', height: '52px' }}>
                    {fotoGrupoUrl && !errosFoto[grupoSelecionado.chave] ? (
                      <img
                        src={fotoGrupoUrl}
                        alt={grupoSelecionado.produto_nome}
                        className="portal-card-foto-img"
                        onError={() => setErrosFoto((prev) => ({ ...prev, [grupoSelecionado.chave]: true }))}
                      />
                    ) : (
                      <div className="portal-card-foto-placeholder" style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>
                        Sem foto
                      </div>
                    )}
                  </div>
                  <div>
                    <strong style={{ fontSize: '15px', color: 'var(--primary)' }}>
                      {grupoSelecionado.produto_nome}
                    </strong>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className="portal-tag">{grupoSelecionado.remessa_numero}</span>
                      {grupoSelecionado.cor && (
                        <span className="portal-tag">
                          {grupoSelecionado.cor_hex && <span className="portal-tag-color-dot" style={{ backgroundColor: grupoSelecionado.cor_hex }} />}
                          {grupoSelecionado.cor}
                        </span>
                      )}
                      {grupoSelecionado.sku && <span>SKU: {grupoSelecionado.sku}</span>}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="portal-btn-trocar-prod"
                  onClick={handleLimparSelecao}
                >
                  ✕ Trocar Modelo
                </button>
              </div>

              {/* SELEÇÃO DO TAMANHO VENDIDO */}
              <div className="portal-seletor-tamanhos-wrap">
                <label className="portal-seletor-tamanhos-label">
                  Selecione o Tamanho Vendido *
                </label>
                <div className="portal-tamanhos-chips-flex">
                  {grupoSelecionado.tamanhos.map((t) => {
                    const isSelected = pecaSelecionada?.id === t.id
                    const hasStock = (t.disponivel_venda || 0) > 0

                    return (
                      <button
                        type="button"
                        key={t.id || t.tamanho}
                        disabled={!hasStock}
                        onClick={() => handleSelecionarTamanho(t)}
                        className={`portal-tam-chip-btn ${isSelected ? 'selecionado' : ''} ${!hasStock ? 'indisponivel' : ''}`}
                      >
                        <span className="tam-chip-letra">{t.tamanho}</span>
                        <span className="tam-chip-qtd">
                          {hasStock ? `${t.disponivel_venda} disp.` : 'Sem estoque'}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {!pecaSelecionada && (
                  <small style={{ color: '#b45309', display: 'block', marginTop: '6px', fontSize: '12px' }}>
                    👉 Escolha o tamanho vendido para habilitar os campos abaixo.
                  </small>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            <div className="portal-form-group">
              <label htmlFor="pv-quantidade">Quantidade Vendida</label>
              <input
                id="pv-quantidade"
                type="number"
                min="1"
                max={pecaSelecionada?.disponivel_venda || 99}
                className="portal-form-input"
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                required
                disabled={enviando || !pecaSelecionada}
              />
            </div>

            <div className="portal-form-group">
              <label htmlFor="pv-preco">Preço da Venda Unitário (R$)</label>
              <input
                id="pv-preco"
                type="number"
                step="0.01"
                min="0.01"
                className="portal-form-input"
                value={precoUnitario}
                onChange={(e) => setPrecoUnitario(e.target.value)}
                placeholder="0.00"
                required
                disabled={enviando || !pecaSelecionada}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            {/* Valor de Repasse - SOMENTE LEITURA */}
            <div className="portal-form-group">
              <label htmlFor="pv-repasse">
                Valor de Repasse <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>(Item da Remessa)</span>
              </label>
              <div className="portal-readonly-field" id="pv-repasse">
                <span style={{ fontWeight: 600 }}>{formatarMoeda(repasseUnitario)}</span>
                <span className="portal-readonly-badge">Somente leitura</span>
              </div>
              <small style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                Valor pré-definido pelo Bazar na remessa (não editável)
              </small>
            </div>

            {/* Desconto em R$ */}
            <div className="portal-form-group">
              <label htmlFor="pv-desconto">Desconto (R$)</label>
              <input
                id="pv-desconto"
                type="number"
                step="0.01"
                min="0"
                max={simulacao ? simulacao.subtotal : undefined}
                className="portal-form-input"
                placeholder="0.00"
                value={descontoMonetario}
                onChange={(e) => setDescontoMonetario(e.target.value)}
                disabled={enviando || !pecaSelecionada}
              />
              <small style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                Opcional. Não pode exceder o valor da venda
              </small>
            </div>
          </div>

          {/* Valor Final Calculado Automaticamente */}
          <div className="portal-form-group">
            <label htmlFor="pv-valor-final">Valor Final da Venda</label>
            <div className="portal-readonly-field" id="pv-valor-final" style={{ background: 'var(--surface)', borderColor: 'var(--primary)' }}>
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
              <label htmlFor="pv-forma">Forma de Pagamento</label>
              <select
                id="pv-forma"
                className="portal-form-select"
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                disabled={enviando}
              >
                <option value="Pix">PIX</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Cartão">Cartão</option>
                <option value="Transferência">Transferência</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div className="portal-form-group">
              <label htmlFor="pv-data">Data da Venda</label>
              <input
                id="pv-data"
                type="date"
                className="portal-form-input"
                value={dataVenda}
                onChange={(e) => setDataVenda(e.target.value)}
                disabled={enviando}
              />
            </div>
          </div>

          <div className="portal-form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'normal' }}>
              <input
                type="checkbox"
                checked={recebeDepois}
                onChange={(e) => {
                  setRecebeDepois(e.target.checked)
                  if (!e.target.checked) setDataRecebimento('')
                }}
                disabled={enviando}
              />
              Vou receber o dinheiro depois (ex.: marketplace)
            </label>
            {recebeDepois && (
              <div style={{ marginTop: '8px' }}>
                <label htmlFor="pv-data-recebimento">Dia em que o dinheiro cai</label>
                <input
                  id="pv-data-recebimento"
                  type="date"
                  className="portal-form-input"
                  value={dataRecebimento}
                  min={dataVenda}
                  onChange={(e) => setDataRecebimento(e.target.value)}
                  disabled={enviando}
                />
                <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)' }}>
                  A peça sai do seu estoque agora, mas a venda só soma nos valores e no acerto a partir desse dia.
                </small>
              </div>
            )}
          </div>

          <div className="portal-form-group">
            <label htmlFor="pv-obs">Observação (Opcional)</label>
            <input
              id="pv-obs"
              type="text"
              className="portal-form-input"
              placeholder="Ex: Cliente Maria comprou à vista..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={enviando}
            />
          </div>

          {simulacao && (
            <div className="portal-preview-box">
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)', marginBottom: '8px' }}>
                Resumo da Venda
              </div>
              <div className="portal-preview-row">
                <span>Subtotal ({simulacao.quantidade} un.):</span>
                <span>{formatarMoeda(simulacao.subtotal)}</span>
              </div>
              {simulacao.valorDesconto > 0 && (
                <div className="portal-preview-row">
                  <span>Desconto Aplicado:</span>
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

          <button
            type="submit"
            className="portal-btn-submit"
            disabled={enviando || !pecaSelecionada}
          >
            {enviando ? 'Registrando Venda...' : 'REGISTRAR VENDA'}
          </button>
        </form>
      </div>
    </div>
  )
}
