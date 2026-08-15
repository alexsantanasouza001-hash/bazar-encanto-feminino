import { useEffect, useRef, useState } from 'react'
import CheckoutSteps from '../components/CheckoutSteps'
import {
  calcularIncentivoFreteGratis,
  normalizarCepFrete
} from './checkoutShipping'
import './Checkout.css'

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

function obterFoto(item) {
  if (item.foto) {
    return item.foto
  }

  const primeiraFoto = Array.isArray(item.fotos)
    ? item.fotos[0]
    : null

  return typeof primeiraFoto === 'string'
    ? primeiraFoto
    : primeiraFoto?.foto || ''
}

function formatarCep(valor) {
  const cep = normalizarCepFrete(valor)
  return cep.length > 5
    ? `${cep.slice(0, 5)}-${cep.slice(5)}`
    : cep
}

function Carrinho({
  itens,
  subtotal,
  desconto,
  total,
  frete,
  cep,
  codigoCupom,
  cupomAplicado,
  mensagemCupom,
  onCodigoCupomChange,
  onAplicarCupom,
  onRemoverCupom,
  onCepChange,
  onCepResolvido,
  onVoltar,
  onContinuar,
  onAumentar,
  onDiminuir,
  onRemover
}) {
  const [cepAberto, setCepAberto] = useState(false)
  const [cepDigitado, setCepDigitado] = useState(
    formatarCep(cep)
  )
  const [consultaCep, setConsultaCep] = useState({
    estado: 'idle',
    mensagem: ''
  })
  const consultaCepRef = useRef(null)

  useEffect(() => {
    setCepDigitado(formatarCep(cep))
  }, [cep])

  useEffect(() => {
    if (itens.length > 0) {
      return
    }

    consultaCepRef.current?.abort()
    consultaCepRef.current = null
    setCepAberto(false)
    setCepDigitado('')
    setConsultaCep({
      estado: 'idle',
      mensagem: ''
    })
  }, [itens.length])

  useEffect(() => () => {
    consultaCepRef.current?.abort()
  }, [])

  const valorParaFreteGratis =
    calcularIncentivoFreteGratis(
      frete.baseFreteGratis
    )

  const abrirCalculoFrete = () => {
    setCepAberto(true)
    setConsultaCep({
      estado: 'idle',
      mensagem: ''
    })
  }

  const alterarCep = (evento) => {
    const cepFormatado =
      formatarCep(evento.target.value)

    consultaCepRef.current?.abort()
    setCepDigitado(cepFormatado)
    setConsultaCep({
      estado: 'idle',
      mensagem: ''
    })
    onCepChange(cepFormatado)
    onCepResolvido(null)
  }

  const calcularFreteCep = async () => {
    const cepNormalizado =
      normalizarCepFrete(cepDigitado)

    if (cepNormalizado.length !== 8) {
      setConsultaCep({
        estado: 'error',
        mensagem: 'CEP inválido.'
      })
      onCepResolvido(null)
      return
    }

    consultaCepRef.current?.abort()

    const controller =
      new AbortController()

    consultaCepRef.current =
      controller

    setConsultaCep({
      estado: 'loading',
      mensagem: 'Calculando...'
    })

    try {
      const resposta = await fetch(
        `https://viacep.com.br/ws/${cepNormalizado}/json/`,
        { signal: controller.signal }
      )

      if (!resposta.ok) {
        throw new Error(
          'Falha ao consultar o CEP.'
        )
      }

      const endereco =
        await resposta.json()

      if (endereco.erro) {
        onCepResolvido(null)
        setConsultaCep({
          estado: 'error',
          mensagem: 'CEP não encontrado.'
        })
        return
      }

      const estado =
        String(
          endereco.uf || ''
        ).toUpperCase()

      if (!/^[A-Z]{2}$/.test(estado)) {
        throw new Error(
          'UF não retornada pelo ViaCEP.'
        )
      }

      const cepConfirmado =
        formatarCep(
          endereco.cep ||
          cepNormalizado
        )

      setCepDigitado(cepConfirmado)
      onCepChange(cepConfirmado)
      onCepResolvido({
        cep: cepNormalizado,
        estado
      })
      setConsultaCep({
        estado: 'success',
        mensagem: 'Frete calculado.'
      })
      setCepAberto(false)
    } catch (erroConsulta) {
      if (
        erroConsulta.name ===
        'AbortError'
      ) {
        return
      }

      onCepResolvido(null)
      setConsultaCep({
        estado: 'error',
        mensagem:
          'Não foi possível consultar o CEP.'
      })
    } finally {
      if (
        consultaCepRef.current ===
        controller
      ) {
        consultaCepRef.current =
          null
      }
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
        <CheckoutSteps etapaAtual={0} />

        <div className="checkout-title">
          <span>SEU PEDIDO</span>
          <h1>Carrinho de compras</h1>
          <p>Revise suas escolhas antes de continuar.</p>
        </div>

        {itens.length === 0 ? (
          <section className="checkout-empty">
            <div aria-hidden="true">◇</div>
            <h2>Seu carrinho está vazio</h2>
            <p>Escolha uma peça especial para iniciar seu pedido.</p>
            <button type="button" onClick={onVoltar}>
              Voltar para a loja
            </button>
          </section>
        ) : (
          <div className="checkout-grid">
            <section className="checkout-card checkout-cart-list">
              <div className="checkout-card-heading">
                <h2>Produtos selecionados</h2>
                <span>{itens.length} item(ns)</span>
              </div>

              {itens.map((item) => {
                const foto = obterFoto(item)
                const preco = Number(item.venda || 0)
                const quantidade = Number(item.quantidade || 0)

                return (
                  <article
                    className="checkout-cart-item"
                    key={`${item.id}-${item.tamanho}`}
                  >
                    <div className="checkout-item-image">
                      {foto ? (
                        <img src={foto} alt={item.nome} />
                      ) : (
                        <span aria-hidden="true">✿</span>
                      )}
                    </div>

                    <div className="checkout-item-info">
                      <span>{item.marca || 'Encanto Feminino'}</span>
                      <h3>{item.nome}</h3>
                      <p>Tamanho: <strong>{item.tamanho}</strong></p>
                      <small>{formatarPreco(preco)} cada</small>
                    </div>

                    <div className="checkout-item-actions">
                      <div className="checkout-quantity" aria-label="Quantidade">
                        <button
                          type="button"
                          onClick={() => onDiminuir(item.id, item.tamanho)}
                          aria-label={`Diminuir quantidade de ${item.nome}`}
                        >
                          −
                        </button>
                        <span>{quantidade}</span>
                        <button
                          type="button"
                          onClick={() => onAumentar(item.id, item.tamanho)}
                          aria-label={`Aumentar quantidade de ${item.nome}`}
                        >
                          +
                        </button>
                      </div>

                      <strong>{formatarPreco(preco * quantidade)}</strong>

                      <button
                        className="checkout-remove"
                        type="button"
                        onClick={() => onRemover(item.id, item.tamanho)}
                      >
                        Remover
                      </button>
                    </div>
                  </article>
                )
              })}

              <button
                className="checkout-back-link"
                type="button"
                onClick={onVoltar}
              >
                ← Continuar comprando
              </button>
            </section>

            <aside className="checkout-card checkout-summary">
              <h2>Resumo do pedido</h2>

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
                {frete.status === 'aguardando_cep' ? (
                  <button
                    type="button"
                    className="checkout-shipping-trigger"
                    onClick={abrirCalculoFrete}
                    aria-expanded={cepAberto}
                  >
                    A calcular
                  </button>
                ) : (
                  <div className="checkout-shipping-result">
                    <span>
                      {frete.status === 'gratis'
                        ? 'Frete grátis'
                        : frete.status === 'fixo'
                          ? `Frete padrão — ${frete.regiao}`
                          : 'Consulte o frete'}
                    </span>
                    {frete.valido && (
                      <strong>
                        {formatarPreco(frete.valor)}
                      </strong>
                    )}
                    {cep && (
                      <button
                        type="button"
                        onClick={abrirCalculoFrete}
                      >
                        Alterar CEP
                      </button>
                    )}
                  </div>
                )}
              </div>

              {cepAberto && (
                <div className="checkout-shipping-calculator">
                  <label htmlFor="cep-carrinho">
                    CEP
                  </label>
                  <div>
                    <input
                      id="cep-carrinho"
                      value={cepDigitado}
                      onChange={alterarCep}
                      onKeyDown={(evento) => {
                        if (evento.key === 'Enter') {
                          evento.preventDefault()
                          calcularFreteCep()
                        }
                      }}
                      placeholder="00000-000"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength="9"
                      aria-describedby="cep-carrinho-status"
                    />
                    <button
                      type="button"
                      onClick={calcularFreteCep}
                      disabled={
                        consultaCep.estado ===
                        'loading'
                      }
                    >
                      {consultaCep.estado === 'loading'
                        ? 'Calculando...'
                        : 'Calcular'}
                    </button>
                  </div>
                  <p
                    id="cep-carrinho-status"
                    className={consultaCep.estado}
                    role={
                      consultaCep.estado === 'error'
                        ? 'alert'
                        : 'status'
                    }
                    aria-live="polite"
                  >
                    {consultaCep.mensagem}
                  </p>
                </div>
              )}

              <div className={`checkout-free-shipping ${frete.status}`}>
                {frete.status === 'gratis'
                  ? '✓ Você ganhou FRETE GRÁTIS!'
                  : `Faltam ${formatarPreco(valorParaFreteGratis)} para você ganhar FRETE GRÁTIS.`}
              </div>

              <div className="checkout-summary-total">
                <span>Total</span>
                <strong>{formatarPreco(total)}</strong>
              </div>

              <div className="checkout-coupon">
                <label htmlFor="codigo-cupom">
                  Cupom de desconto
                </label>

                <div className="checkout-coupon-form">
                  <input
                    id="codigo-cupom"
                    value={codigoCupom}
                    onChange={(evento) =>
                      onCodigoCupomChange(
                        evento.target.value.toUpperCase()
                      )
                    }
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter') {
                        evento.preventDefault()
                        onAplicarCupom()
                      }
                    }}
                    placeholder="Digite o código do cupom"
                    disabled={Boolean(cupomAplicado)}
                  />
                  <button
                    type="button"
                    onClick={onAplicarCupom}
                    disabled={Boolean(cupomAplicado)}
                  >
                    Aplicar
                  </button>
                </div>

                {mensagemCupom && (
                  <p
                    className={`checkout-coupon-message ${mensagemCupom.tipo}`}
                    role="status"
                  >
                    {mensagemCupom.texto}
                  </p>
                )}

                {cupomAplicado && (
                  <div className="checkout-coupon-applied">
                    <span>
                      {cupomAplicado.codigo}
                    </span>
                    <button
                      type="button"
                      onClick={onRemoverCupom}
                    >
                      Remover cupom
                    </button>
                  </div>
                )}
              </div>

              <button
                className="checkout-primary-button"
                type="button"
                onClick={onContinuar}
              >
                Continuar para finalização
              </button>

              <p className="checkout-secure-note">
                Você poderá revisar os dados antes de finalizar.
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}

export default Carrinho
