import './Institucional.css'
import Footer from '../components/Footer'

export default function TrocasDevolucoes({ onNavegar }) {
  return (
    <div className="pagina-institucional">
      <div className="institucional-container">
        <button
          className="institucional-voltar"
          onClick={() => (onNavegar ? onNavegar('/') : (window.location.href = '/'))}
        >
          ← Voltar para a Loja
        </button>

        <h1>Política de Trocas e Devoluções</h1>

        <p>
          No <strong>Bazar Encanto Feminino</strong>, a sua satisfação é nossa prioridade. Nossa política de trocas e devoluções é amparada pelo Código de Defesa do Consumidor.
        </p>

        <h2>1. Direito de Arrependimento (Devolução em até 7 dias)</h2>
        <p>
          Conforme o Artigo 49 do Código de Defesa do Consumidor, o cliente tem até <strong>7 (sete) dias corridos</strong> após o recebimento do produto para solicitar o cancelamento e a devolução total com reembolso, sem necessidade de justificativa.
        </p>

        <h2>2. Troca por Defeito de Fabricação ou Tamanho</h2>
        <p>
          Caso o produto apresente qualquer defeito ou o tamanho selecionado não sirva adequadamente:
        </p>
        <ul>
          <li>A solicitação deve ser feita em até <strong>30 dias corridos</strong> após o recebimento.</li>
          <li>A peça deve estar sem indícios de uso, com as etiquetas originais afixadas e acompanhada de sua nota/comprovante de compra.</li>
        </ul>

        <h2>3. Procedimento de Envio</h2>
        <p>
          Após aprovação da solicitação pelo atendimento, será gerado um código de postagem reversa dos Correios para envio sem custos no caso de primeira troca ou devolução motivada por defeito.
        </p>

        <h2>4. Reembolso</h2>
        <p>
          O reembolso do valor pago será realizado no mesmo método de pagamento utilizado na compra (estorno na fatura do cartão ou Pix de volta) após o recebimento e checagem da peça devolvida.
        </p>

        <div className="institucional-alerta">
          <strong>Solicitação de Troca ou Devolução:</strong> Para iniciar o procedimento de postagem reversa, entre em contato com nosso atendimento informando o número do pedido e as peças a serem trocadas.
        </div>
      </div>
      <Footer onNavegar={onNavegar} />
    </div>
  )
}
