import { useEffect, useRef, useState } from 'react'
import CheckoutSteps from '../components/CheckoutSteps'
import MercadoPagoCard from '../components/MercadoPagoCard'
import './Checkout.css'

function normalizarCep(valor) {
  return String(valor || '').replace(/\D/g, '').slice(0, 8)
}

function formatarCep(valor) {
  const cep = normalizarCep(valor)
  return cep.length > 5 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep
}

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

function Checkout({
  itens,
  subtotal,
  desconto,
  total,
  frete,
  opcoesFrete = [],
  servicoFreteSelecionado = null,
  onSelecionarServicoFrete,
  cotandoFrete = false,
  mensagemFrete = '',
  cupomAplicado,
  dados,
  onDadosChange,
  onCepResolvido,
  salvarDados,
  onSalvarDadosChange,
  formaPagamento,
  onFormaPagamentoChange,
  aceitouTermos,
  onAceitouTermosChange,
  usuario,
  onEntrar,
  erro,
  finalizando,
  onVoltar,
  onFinalizar
}) {
  const [consultaCep, setConsultaCep] = useState({
    estado: 'idle',
    mensagem: ''
  })
  const ultimoCepConsultado = useRef('')
  const cepInputRef = useRef(null)

  const focarCalculoFrete = () => {
    if (cepInputRef.current) {
      cepInputRef.current.focus()
      cepInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  useEffect(() => {
    if (!erro) return

    const erroLower = String(erro).toLowerCase()
    if (erroLower.includes('termos') || erroLower.includes('concordar')) {
      const termosEl = document.querySelector('.checkout-terms input')
      if (termosEl) {
        termosEl.focus()
        termosEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } else if (erroLower.includes('nome')) {
      const el = document.querySelector('input[name="nome"]')
      if (el) {
        el.focus()
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } else if (erroLower.includes('e-mail') || erroLower.includes('email')) {
      const el = document.querySelector('input[name="email"]')
      if (el) {
        el.focus()
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } else if (erroLower.includes('telefone') || erroLower.includes('whatsapp')) {
      const el = document.querySelector('input[name="telefone"]')
      if (el) {
        el.focus()
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } else if (erroLower.includes('cep') || erroLower.includes('frete')) {
      if (cepInputRef.current) {
        cepInputRef.current.focus()
        cepInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } else if (erroLower.includes('endereço') || erroLower.includes('número')) {
      const el = document.querySelector('input[name="numero"]') || document.querySelector('input[name="endereco"]')
      if (el) {
        el.focus()
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } else if (erroLower.includes('pagamento')) {
      const el = document.querySelector('.checkout-payment')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [erro])

  const consultarCepManual = async () => {
    const cep = normalizarCep(dados.cep)
    if (cep.length !== 8) {
      setConsultaCep({
        estado: 'error',
        mensagem: 'Informe um CEP válido com 8 dígitos.'
      })
      onCepResolvido(null)
      return
    }

    ultimoCepConsultado.current = cep
    setConsultaCep({
      estado: 'loading',
      mensagem: 'Consultando CEP...'
    })

    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      if (!resposta.ok) throw new Error('Falha ao consultar o CEP.')
      const endereco = await resposta.json()
      if (endereco.erro) {
        onCepResolvido(null)
        setConsultaCep({
          estado: 'error',
          mensagem: 'CEP não encontrado. Confira ou preencha o endereço manualmente.'
        })
        return
      }

      onDadosChange((dadosAtuais) => ({
        ...dadosAtuais,
        cep: formatarCep(endereco.cep || cep),
        endereco: endereco.logradouro || dadosAtuais.endereco,
        bairro: endereco.bairro || dadosAtuais.bairro,
        cidade: endereco.localidade || dadosAtuais.cidade,
        estado: endereco.uf || dadosAtuais.estado
      }))
      onCepResolvido({
        cep,
        estado: String(endereco.uf || '').toUpperCase()
      })
      setConsultaCep({
        estado: 'success',
        mensagem: 'Endereço localizado com sucesso.'
      })
    } catch {
      onCepResolvido(null)
      setConsultaCep({
        estado: 'error',
        mensagem: 'Não foi possível consultar o CEP. Preencha o endereço manualmente.'
      })
    }
  }

  useEffect(() => {
    const cep = normalizarCep(dados.cep)

    if (cep.length !== 8) {
      ultimoCepConsultado.current = ''
      onCepResolvido(null)
      return undefined
    }

    if (ultimoCepConsultado.current === cep) {
      return undefined
    }

    const controller = new AbortController()
    const espera = window.setTimeout(async () => {
      ultimoCepConsultado.current = cep
      setConsultaCep({
        estado: 'loading',
        mensagem: 'Consultando CEP...'
      })

      try {
        const resposta = await fetch(
          `https://viacep.com.br/ws/${cep}/json/`,
          { signal: controller.signal }
        )

        if (!resposta.ok) {
          throw new Error('Falha ao consultar o CEP.')
        }

        const endereco = await resposta.json()

        if (endereco.erro) {
          onCepResolvido(null)
          setConsultaCep({
            estado: 'error',
            mensagem: 'CEP não encontrado. Confira ou preencha o endereço manualmente.'
          })
          return
        }

        onDadosChange((dadosAtuais) => ({
          ...dadosAtuais,
          cep: formatarCep(endereco.cep || cep),
          endereco: endereco.logradouro || dadosAtuais.endereco,
          bairro: endereco.bairro || dadosAtuais.bairro,
          cidade: endereco.localidade || dadosAtuais.cidade,
          estado: endereco.uf || dadosAtuais.estado
        }))
        onCepResolvido({
          cep,
          estado: String(endereco.uf || '').toUpperCase()
        })
        setConsultaCep({
          estado: 'success',
          mensagem: 'Endereço localizado. Você pode ajustar os campos se necessário.'
        })
      } catch (erroConsulta) {
        if (erroConsulta.name === 'AbortError') {
          return
        }

        ultimoCepConsultado.current = ''
        onCepResolvido(null)
        setConsultaCep({
          estado: 'error',
          mensagem: 'Não foi possível consultar o CEP. Preencha o endereço manualmente.'
        })
      }
    }, 350)

    return () => {
      window.clearTimeout(espera)
      controller.abort()
    }
  }, [dados.cep, onCepResolvido, onDadosChange])

  const atualizarCampo = (evento) => {
    const { name } = evento.target
    const value = name === 'cep'
      ? formatarCep(evento.target.value)
      : evento.target.value

    if (name === 'cep') {
      setConsultaCep({ estado: 'idle', mensagem: '' })
      onCepResolvido(null)
    }

    onDadosChange({
      ...dados,
      [name]: value
    })
  }

  const validarCepAoSair = () => {
    const cep = normalizarCep(dados.cep)

    if (cep.length > 0 && cep.length !== 8) {
      setConsultaCep({
        estado: 'error',
        mensagem: 'Informe um CEP válido com 8 dígitos.'
      })
    }
  }

  return (
    <div className="checkout-page">
      <header className="checkout-header">
        <button
          className="checkout-brand"
          type="button"
          onClick={onVoltar}
        >
          <span>✿</span>
          <span>
            <small>Bazar</small>
            <strong>Encanto Feminino</strong>
          </span>
        </button>
      </header>

      <main className="checkout-shell">
        <CheckoutSteps etapaAtual={1} />

        <div className="checkout-title">
          <span>FINALIZAÇÃO</span>
          <h1>Detalhes da compra</h1>
          <p>Informe os dados da cliente e escolha como deseja pagar.</p>
        </div>

        <div className="checkout-grid">
          <section className="checkout-card checkout-form-card">
            <div className="checkout-card-heading">
              <div>
                <span>DADOS PARA ENTREGA</span>
                <h2>Informações da cliente</h2>
              </div>
            </div>

            {usuario ? (
              <div className="checkout-account-status logged">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Conta conectada</strong>
                  <p>
                    Seus dados de contato foram preenchidos automaticamente.
                  </p>
                </div>
              </div>
            ) : (
              <div className="checkout-account-status">
                <div>
                  <strong>Comprar como convidada</strong>
                  <p>
                    Você pode continuar sem conta ou entrar para preencher
                    seus dados automaticamente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onEntrar}
                >
                  Entrar
                </button>
              </div>
            )}

            {erro && (
              <div className="checkout-error" role="alert">
                {erro}
              </div>
            )}

            <div className="checkout-form-grid">
              <label>
                Nome
                <input
                  name="nome"
                  value={dados.nome}
                  onChange={atualizarCampo}
                  autoComplete="given-name"
                  required
                />
              </label>
              <label>
                Sobrenome
                <input
                  name="sobrenome"
                  value={dados.sobrenome}
                  onChange={atualizarCampo}
                  autoComplete="family-name"
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  name="email"
                  value={dados.email}
                  onChange={atualizarCampo}
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Telefone / WhatsApp
                <input
                  type="tel"
                  name="telefone"
                  value={dados.telefone}
                  onChange={atualizarCampo}
                  autoComplete="tel"
                  required
                />
              </label>
              <label>
                CPF
                <input
                  name="cpf"
                  value={dados.cpf}
                  onChange={atualizarCampo}
                  inputMode="numeric"
                />
              </label>
              <label>
                CEP
                <div className="checkout-cep-group">
                  <input
                    ref={cepInputRef}
                    name="cep"
                    value={dados.cep}
                    onChange={atualizarCampo}
                    onBlur={validarCepAoSair}
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter') {
                        evento.preventDefault()
                        consultarCepManual()
                      }
                    }}
                    autoComplete="postal-code"
                    inputMode="numeric"
                    maxLength="9"
                    placeholder="00000-000"
                    aria-describedby="checkout-cep-status"
                    required
                  />
                  <button
                    type="button"
                    className="checkout-cep-btn"
                    onClick={consultarCepManual}
                    disabled={consultaCep.estado === 'loading'}
                  >
                    {consultaCep.estado === 'loading' ? 'Calculando...' : 'Calcular frete'}
                  </button>
                </div>
                <small
                  id="checkout-cep-status"
                  className={`checkout-cep-status ${consultaCep.estado}`}
                  aria-live="polite"
                >
                  {consultaCep.mensagem}
                </small>
              </label>
              <label className="checkout-field-wide">
                Endereço
                <input
                  name="endereco"
                  value={dados.endereco}
                  onChange={atualizarCampo}
                  autoComplete="street-address"
                  required
                />
              </label>
              <label>
                Número
                <input
                  name="numero"
                  value={dados.numero}
                  onChange={atualizarCampo}
                  required
                />
              </label>
              <label>
                Complemento
                <input
                  name="complemento"
                  value={dados.complemento}
                  onChange={atualizarCampo}
                />
              </label>
              <label>
                Bairro
                <input
                  name="bairro"
                  value={dados.bairro}
                  onChange={atualizarCampo}
                  required
                />
              </label>
              <label>
                Cidade
                <input
                  name="cidade"
                  value={dados.cidade}
                  onChange={atualizarCampo}
                  autoComplete="address-level2"
                  required
                />
              </label>
              <label>
                Estado
                <input
                  name="estado"
                  value={dados.estado}
                  onChange={atualizarCampo}
                  autoComplete="address-level1"
                  maxLength="2"
                  required
                />
              </label>
            </div>

            {frete.status === 'gratis' ? (
              <div className="checkout-shipping-option gratis">
                <div>
                  <span>ENTREGA</span>
                  <strong>Frete Grátis (Compras acima de R$ 400)</strong>
                </div>
                <strong>GRÁTIS</strong>
              </div>
            ) : opcoesFrete && opcoesFrete.length > 0 ? (
              <div className="checkout-shipping-section">
                <span className="checkout-shipping-label">OPÇÕES DE ENTREGA (MELHOR ENVIO)</span>
                <div className="checkout-shipping-list">
                  {opcoesFrete.map((opt) => {
                    const selecionado = servicoFreteSelecionado?.id === opt.id
                    return (
                      <label
                        key={opt.id}
                        className={`checkout-shipping-card ${selecionado ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="opcaoFreteMelhorEnvio"
                          value={opt.id}
                          checked={selecionado}
                          onChange={() => onSelecionarServicoFrete?.(opt)}
                        />
                        <div className="shipping-card-details">
                          <div className="shipping-card-header">
                            <strong className="shipping-card-title">{opt.servico}</strong>
                            <span className="shipping-card-carrier">({opt.transportadora})</span>
                          </div>
                          <span className="shipping-card-time">{opt.prazo_texto}</span>
                        </div>
                        <span className="shipping-card-price">{formatarPreco(opt.valor)}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className={`checkout-shipping-option ${frete.status}`}>
                <div>
                  <span>ENTREGA</span>
                  <strong>
                    {frete.status === 'calculado' ? (
                      frete.servico || 'Entrega Calculada'
                    ) : (
                      <>
                        Opções de entrega:{' '}
                        <button
                          type="button"
                          className="checkout-shipping-trigger"
                          onClick={focarCalculoFrete}
                        >
                          A calcular
                        </button>
                      </>
                    )}
                  </strong>
                </div>

                {frete.valido && frete.valor !== null ? (
                  <strong>{formatarPreco(frete.valor)}</strong>
                ) : (
                  <button
                    type="button"
                    className="checkout-shipping-trigger"
                    onClick={focarCalculoFrete}
                  >
                    A calcular
                  </button>
                )}

                <p>
                  {cotandoFrete
                    ? 'Calculando opções de envio no Melhor Envio...'
                    : mensagemFrete
                    ? mensagemFrete
                    : !dados.cep || normalizarCep(dados.cep).length !== 8
                    ? 'Informe seu CEP para consultar as opções de entrega.'
                    : 'Opções de entrega indisponíveis no momento.'}
                </p>
              </div>
            )}

            <label className="checkout-checkbox">
              <input
                type="checkbox"
                checked={salvarDados}
                onChange={(evento) =>
                  onSalvarDadosChange(evento.target.checked)
                }
              />
              <span>
                Salvar estes dados para compras futuras
                <small>Disponível quando o cadastro de clientes for implementado.</small>
              </span>
            </label>

            <button
              className="checkout-back-link"
              type="button"
              onClick={onVoltar}
            >
              ← Voltar ao carrinho
            </button>
          </section>

          <aside className="checkout-card checkout-summary checkout-summary-details">
            <h2>Resumo do pedido</h2>

            <div className="checkout-mini-items">
              {itens.map((item) => (
                <div key={item.cor ? `${item.id}-${item.cor}-${item.tamanho}` : `${item.id}-${item.tamanho}`}>
                  <span>
                    {item.quantidade}× {item.nome}
                    <small>
                      {item.cor && item.cor !== 'Única' ? `${item.cor} • ` : ''}
                      {item.tamanho ? `Tam ${item.tamanho}` : ''}
                    </small>
                  </span>
                  <strong>
                    {formatarPreco(
                      Number(item.venda || 0) *
                      Number(item.quantidade || 0)
                    )}
                  </strong>
                </div>
              ))}
            </div>

            <div className="checkout-summary-row">
              <span>Subtotal</span>
              <strong>{formatarPreco(subtotal)}</strong>
            </div>
            <div className="checkout-summary-row">
              <span>Cupom / Desconto</span>
              <strong className={desconto > 0 ? 'checkout-discount-value' : ''}>
                {desconto > 0 ? '−' : ''}{formatarPreco(desconto)}
              </strong>
            </div>
            <div className="checkout-summary-row checkout-shipping-summary-row">
              <span>Envio</span>
              {frete.status === 'gratis' ? (
                <strong>GRÁTIS</strong>
              ) : frete.valido && frete.valor !== null ? (
                <strong>{formatarPreco(frete.valor)}</strong>
              ) : (
                <button
                  type="button"
                  className="checkout-shipping-trigger"
                  onClick={focarCalculoFrete}
                  title="Clique para informar o CEP e calcular o frete"
                >
                  A calcular
                </button>
              )}
            </div>
            <div className="checkout-summary-total">
              <span>Total</span>
              <strong>{formatarPreco(total)}</strong>
            </div>

            {cupomAplicado && (
              <div className="checkout-coupon-checkout">
                <span>Cupom aplicado</span>
                <strong>{cupomAplicado.codigo}</strong>
              </div>
            )}

            <fieldset className="checkout-payment">
              <legend>Forma de pagamento</legend>
              <label className={formaPagamento === 'Pix' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="pagamento"
                  value="Pix"
                  checked={formaPagamento === 'Pix'}
                  onChange={(evento) =>
                    onFormaPagamentoChange(evento.target.value)
                  }
                />
                <span>◇</span>
                <strong>Pix</strong>
                <small>QR Code e Pix copia e cola</small>
              </label>
              <label className={formaPagamento === 'Cartão de crédito' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="pagamento"
                  value="Cartão de crédito"
                  checked={formaPagamento === 'Cartão de crédito'}
                  onChange={(evento) =>
                    onFormaPagamentoChange(evento.target.value)
                  }
                />
                <span>▭</span>
                <strong>Cartão de crédito</strong>
                <small>Ambiente seguro Mercado Pago</small>
              </label>
            </fieldset>

            {formaPagamento === 'Cartão de crédito' && (
              <MercadoPagoCard
                amount={total}
                disabled={finalizando || !frete.valido || !aceitouTermos}
                onSubmit={(dadosCartao) => onFinalizar(null, dadosCartao)}
              />
            )}

            <div className={`checkout-terms-wrapper ${erro && !aceitouTermos ? 'has-error' : ''}`}>
              <label className="checkout-checkbox checkout-terms">
                <input
                  type="checkbox"
                  checked={aceitouTermos}
                  onChange={(evento) =>
                    onAceitouTermosChange(evento.target.checked)
                  }
                />
                <span>Li e concordo com os termos e condições</span>
              </label>
              {erro && !aceitouTermos && (
                <span className="checkout-field-error-msg" role="alert">
                  ⚠ Você precisa concordar com os termos e condições.
                </span>
              )}
            </div>

            {erro && (
              <div className="checkout-summary-error" role="alert">
                <span>⚠ {erro}</span>
              </div>
            )}

            {formaPagamento !== 'Cartão de crédito' && (
              <button
                className="checkout-primary-button"
                type="button"
                onClick={() => onFinalizar()}
                disabled={finalizando || !frete.valido}
              >
                {finalizando ? 'Gerando Pix...' : 'Gerar Pix'}
              </button>
            )}

            <p className="checkout-secure-note">
              Pagamento processado pelo Mercado Pago. Dados completos do
              cartão não são armazenados pelo Bazar.
            </p>
          </aside>
        </div>
      </main>
    </div>
  )
}

export default Checkout
