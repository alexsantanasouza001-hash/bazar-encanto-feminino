import { useEffect, useState, useMemo } from 'react'
import {
  obterPaletaCoresProduto,
  obterFotosDaCor,
  obterGradeTamanhosDaCor,
  formatarPreco
} from '../pages/variacoesHelpers.js'

function ModalDetalheProduto({
  produto,
  corInicial = '',
  onClose,
  onAdicionarCarrinho
}) {
  const [corAtiva, setCorAtiva] = useState('')
  const [fotoIndice, setFotoIndice] = useState(0)
  const [tamanhoSelecionado, setTamanhoSelecionado] = useState(null)
  const [feedback, setFeedback] = useState(null)

  const paleta = useMemo(() => obterPaletaCoresProduto(produto), [produto])

  useEffect(() => {
    if (!produto) return

    let corPadrao = corInicial
    if (!corPadrao && paleta.length > 0) {
      corPadrao = paleta[0].nome
    }
    setCorAtiva(corPadrao)
    setFotoIndice(0)

    // Selecionar o primeiro tamanho disponível desta cor
    const grade = obterGradeTamanhosDaCor(produto, corPadrao)
    const primeiroDisponivel = grade.find((t) => t.disponivel)
    setTamanhoSelecionado(primeiroDisponivel ? primeiroDisponivel.tamanho : null)
    setFeedback(null)
  }, [produto, corInicial, paleta])

  if (!produto) return null

  const fotos = obterFotosDaCor(produto, corAtiva)
  const gradeTamanhos = obterGradeTamanhosDaCor(produto, corAtiva)
  const corObj = paleta.find((c) => c.nome === corAtiva) || paleta[0] || { nome: 'Única', hex: '#234B36' }

  const handleTrocarCor = (novaCor) => {
    setCorAtiva(novaCor)
    setFotoIndice(0)
    setFeedback(null)

    // Ao mudar de cor, recalcular disponibilidade dos tamanhos
    const novaGrade = obterGradeTamanhosDaCor(produto, novaCor)
    const tamAtualAindaValido = novaGrade.find((t) => t.tamanho === tamanhoSelecionado && t.disponivel)
    if (!tamAtualAindaValido) {
      const primeiroDisp = novaGrade.find((t) => t.disponivel)
      setTamanhoSelecionado(primeiroDisp ? primeiroDisp.tamanho : null)
    }
  }

  const handleComprar = () => {
    if (!tamanhoSelecionado) {
      setFeedback({
        tipo: 'erro',
        texto: 'Por favor, selecione um tamanho disponível.'
      })
      return
    }

    const tamItem = gradeTamanhos.find((t) => t.tamanho === tamanhoSelecionado)
    if (!tamItem || !tamItem.disponivel) {
      setFeedback({
        tipo: 'erro',
        texto: 'O tamanho selecionado está esgotado nesta cor.'
      })
      return
    }

    const fotoFinal = fotos[fotoIndice] || fotos[0] || produto.foto || null

    onAdicionarCarrinho(produto, corAtiva, tamanhoSelecionado, fotoFinal, true)
    onClose()
  }

  return (
    <div
      className="loja-detalhe-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalhes de ${produto.nome}`}
    >
      <div className="loja-detalhe-modal">
        <button
          type="button"
          className="loja-detalhe-fechar"
          onClick={onClose}
          aria-label="Fechar detalhes"
        >
          ✕
        </button>

        {/* ÁREA DE FOTOS DA COR SELECIONADA */}
        <div className="loja-detalhe-foto-area">
          <div className="loja-detalhe-foto-carousel">
            {fotos.length > 0 ? (
              <img
                src={fotos[fotoIndice] || fotos[0]}
                alt={`${produto.nome} - ${corAtiva}`}
                className="loja-detalhe-foto-principal"
              />
            ) : (
              <div className="loja-foto-placeholder">✿</div>
            )}

            {fotos.length > 1 && (
              <>
                <button
                  type="button"
                  className="loja-modal-arrow prev"
                  onClick={() =>
                    setFotoIndice((prev) => (prev > 0 ? prev - 1 : fotos.length - 1))
                  }
                  aria-label="Foto anterior"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="loja-modal-arrow next"
                  onClick={() =>
                    setFotoIndice((prev) => (prev < fotos.length - 1 ? prev + 1 : 0))
                  }
                  aria-label="Próxima foto"
                >
                  ›
                </button>
              </>
            )}
          </div>

          {/* INDICADORES / THUMBNAILS */}
          {fotos.length > 1 && (
            <div className="loja-detalhe-thumbs">
              {fotos.map((foto, idx) => (
                <button
                  type="button"
                  key={idx}
                  className={`loja-detalhe-thumb ${idx === fotoIndice ? 'active' : ''}`}
                  onClick={() => setFotoIndice(idx)}
                  aria-label={`Ver foto ${idx + 1}`}
                >
                  <img src={foto} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ÁREA DE INFORMAÇÕES, SELEÇÃO DE COR E TAMANHO */}
        <div className="loja-detalhe-info">
          <span className="loja-detalhe-categoria">{produto.categoria || 'Moda Feminina'}</span>
          <h2 className="loja-detalhe-nome">{produto.nome}</h2>
          {produto.marca && <span className="loja-detalhe-marca">{produto.marca}</span>}
          <strong className="loja-detalhe-preco">{formatarPreco(produto.venda)}</strong>

          {produto.descricao && <p className="loja-detalhe-desc">{produto.descricao}</p>}

          {/* SELETOR DE COR */}
          <div className="loja-detalhe-secao-variacao">
            <div className="loja-secao-label">
              <span>COR:</span>
              <strong className="cor-nome-destaque">{corObj.nome}</strong>
            </div>
            <div className="loja-cores-selector-grid">
              {paleta.map((corItem) => {
                const ativa = corItem.nome === corAtiva
                return (
                  <button
                    key={corItem.id || corItem.nome}
                    type="button"
                    className={`loja-cor-chip ${ativa ? 'active' : ''}`}
                    onClick={() => handleTrocarCor(corItem.nome)}
                    title={`Selecionar cor ${corItem.nome}`}
                    aria-pressed={ativa}
                  >
                    <span
                      className="loja-cor-chip-swatch"
                      style={{ backgroundColor: corItem.hex }}
                    />
                    <span className="loja-cor-chip-nome">{corItem.nome}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* SELETOR DE TAMANHO */}
          <div className="loja-detalhe-secao-variacao">
            <div className="loja-secao-label">
              <span>TAMANHO:</span>
              {tamanhoSelecionado && <strong className="tam-nome-destaque">{tamanhoSelecionado}</strong>}
            </div>
            <div className="loja-tamanhos-selector-grid">
              {gradeTamanhos.map((item) => {
                const selecionado = tamanhoSelecionado === item.tamanho
                const esgotado = !item.disponivel
                return (
                  <button
                    key={item.tamanho}
                    type="button"
                    className={`loja-tam-chip ${selecionado ? 'active' : ''} ${esgotado ? 'esgotado' : ''}`}
                    disabled={esgotado}
                    onClick={() => {
                      setTamanhoSelecionado(item.tamanho)
                      setFeedback(null)
                    }}
                    title={esgotado ? `Tamanho ${item.tamanho} esgotado` : `Tamanho ${item.tamanho} disponível`}
                    aria-label={esgotado ? `Tamanho ${item.tamanho} esgotado` : `Tamanho ${item.tamanho} disponível`}
                    aria-pressed={selecionado}
                  >
                    <span>{item.tamanho}</span>
                    {esgotado && <span className="tam-esgotado-traco" />}
                  </button>
                )
              })}
            </div>
          </div>

          {feedback && (
            <div className={`loja-modal-feedback ${feedback.tipo}`}>
              {feedback.texto}
            </div>
          )}

          {/* AÇÕES DE COMPRA */}
          <div className="loja-detalhe-acoes">
            <button
              type="button"
              className="loja-detalhe-comprar"
              onClick={handleComprar}
            >
              Adicionar à Sacola
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ModalDetalheProduto
