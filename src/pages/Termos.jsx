import './Institucional.css'
import Footer from '../components/Footer'

export default function Termos({ onNavegar }) {
  return (
    <div className="pagina-institucional">
      <div className="institucional-container">
        <button
          className="institucional-voltar"
          onClick={() => (onNavegar ? onNavegar('/') : (window.location.href = '/'))}
        >
          ← Voltar para a Loja
        </button>

        <h1>Termos e Condições de Uso</h1>

        <p>
          Ao acessar e efetuar compras no <strong>Bazar Encanto Feminino</strong>, a cliente concorda com as condições detalhadas a seguir.
        </p>

        <h2>1. Produtos e Disponibilidade</h2>
        <p>
          As imagens dos produtos exibidas na loja buscam ser o mais fiéis possível às cores e detalhes reais. Contudo, variações de cor podem ocorrer devido às configurações de tela. Todas as vendas estão sujeitas à disponibilidade de estoque e confirmação do pagamento.
        </p>

        <h2>2. Preços e Pagamentos</h2>
        <p>
          Os preços informados no catálogo estão em Reais (BRL). Reservamo-nos o direito de corrigir eventuais erros de digitação de preços. Os pagamentos são processados via Mercado Pago (Pix e Cartão de Crédito). Pedidos via Pix mantêm a reserva de estoque temporária durante o prazo estipulado de validade.
        </p>

        <h2>3. Entregas e Prazos</h2>
        <p>
          Os prazos de entrega e valores de frete são calculados de acordo com o CEP informado e a modalidade selecionada no momento do checkout. O rastreamento pode ser acompanhado diretamente na nossa aba pública de <em>Acompanhar Pedido</em>.
        </p>

        <h2>4. Propriedade Intelectual</h2>
        <p>
          Todo o conteúdo da marca, incluindo logotipos, textos e artes gráficas, é protegido pelas leis de propriedade intelectual e não pode ser reproduzido sem autorização prévia.
        </p>

        <div className="institucional-alerta">
          <strong>Foro e Legislação:</strong> Os presentes termos são regidos pelas leis da República Federativa do Brasil e pelo Código de Defesa do Consumidor.
        </div>
      </div>
      <Footer onNavegar={onNavegar} />
    </div>
  )
}
