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
                <input
                  name="cep"
                  value={dados.cep}
                  onChange={atualizarCampo}
                  onBlur={validarCepAoSair}
                  autoComplete="postal-code"
                  inputMode="numeric"
                  maxLength="9"
                  aria-describedby="checkout-cep-status"
                  required
                />
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

            <div className={`checkout-shipping-option ${frete.status}`}>
              <div>
                <span>ENTREGA</span>
                <strong>
                  {frete.status === 'gratis'
                    ? 'Frete grátis'
                    : frete.status === 'fixo'
                      ? 'Frete padrão — Sul e Sudeste'
                      : frete.status === 'consultar'
                        ? 'Consulte o frete'
                        : 'Informe o CEP para calcular o frete'}
                </strong>
              </div>
              {frete.valido && (
                <strong>
                  {frete.status === 'gratis'
                    ? 'GRÁTIS'
                    : formatarPreco(frete.valor)}
                </strong>
              )}
              {frete.status === 'consultar' && (
                <p>
                  Para esta região, confirme uma modalidade e um valor de
                  entrega com a loja antes de finalizar.
                </p>
              )}
            </div>

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
                <div key={`${item.id}-${item.tamanho}`}>
                  <span>
                    {item.quantidade}× {item.nome}
                    <small>Tamanho {item.tamanho}</small>
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
            <div className="checkout-summary-row">
              <span>Envio</span>
              <strong>
                {frete.status === 'gratis'
                  ? 'GRÁTIS'
                  : frete.status === 'fixo'
                    ? formatarPreco(frete.valor)
                    : frete.status === 'consultar'
                      ? 'Consulte o frete'
                      : 'A calcular'}
              </strong>
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
