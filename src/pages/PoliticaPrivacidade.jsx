import './Institucional.css'
import Footer from '../components/Footer'

export default function PoliticaPrivacidade({ onNavegar }) {
  return (
    <div className="pagina-institucional">
      <div className="institucional-container">
        <button
          className="institucional-voltar"
          onClick={() => (onNavegar ? onNavegar('/') : (window.location.href = '/'))}
        >
          ← Voltar para a Loja
        </button>

        <h1>Política de Privacidade</h1>

        <p>
          O <strong>Bazar Encanto Feminino</strong> valoriza a privacidade e a segurança dos dados pessoais de nossas clientes. Esta Política explica de forma clara como tratamos as informações coletadas durante a sua navegação e compra.
        </p>

        <h2>1. Coleta de Informações</h2>
        <p>
          Coletamos exclusivamente os dados necessários para o processamento de pedidos e entrega:
        </p>
        <ul>
          <li><strong>Dados Pessoais:</strong> Nome completo, e-mail e telefone para comunicação sobre o pedido.</li>
          <li><strong>Dados de Entrega:</strong> Endereço completo e CEP para cálculo de frete e envio.</li>
          <li><strong>Dados de Pagamento:</strong> Processados em ambiente seguro diretamente pelo gateway parceiro (Mercado Pago). Não armazenamos números de cartão nem dados bancários em nossos servidores.</li>
        </ul>

        <h2>2. Uso dos Dados</h2>
        <p>
          Os dados coletados são utilizados estritamente para:
        </p>
        <ul>
          <li>Faturamento e emissão do pedido;</li>
          <li>Comunicação sobre atualizações de status e rastreamento;</li>
          <li>Prevenção de fraudes e proteção de segurança (rate limiting e idempotência);</li>
          <li>Atendimento a solicitações de suporte ou trocas.</li>
        </ul>

        <h2>3. Compartilhamento de Dados</h2>
        <p>
          Não vendemos ou comercializamos dados pessoais. O compartilhamento ocorre apenas com parceiros essenciais para a operação:
        </p>
        <ul>
          <li><strong>Mercado Pago:</strong> Para processamento seguro das transações de Pix e cartão de crédito.</li>
          <li><strong>Transportadoras/Correios:</strong> Para realização das entregas físicas.</li>
        </ul>

        <h2>4. Direitos da Cliente</h2>
        <p>
          A cliente possui o direito de solicitar a confirmação, acesso, correção ou exclusão de seus dados pessoais em conformidade com a LGPD (Lei Geral de Proteção de Dados).
        </p>

        <div className="institucional-alerta">
          <strong>Privacidade e Atendimento:</strong> Para solicitações sobre seus dados pessoais ou dúvidas sobre esta política, entre em contato através dos nossos canais de atendimento.
        </div>
      </div>
      <Footer onNavegar={onNavegar} />
    </div>
  )
}
