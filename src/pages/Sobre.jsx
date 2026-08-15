import './Institucional.css'
import Footer from '../components/Footer'

export default function Sobre({ onNavegar }) {
  return (
    <div className="pagina-institucional">
      <div className="institucional-container">
        <button
          className="institucional-voltar"
          onClick={() => (onNavegar ? onNavegar('/') : (window.location.href = '/'))}
        >
          ← Voltar para a Loja
        </button>

        <h1>Sobre o Bazar Encanto Feminino</h1>

        <p>
          O <strong>Bazar Encanto Feminino</strong> nasceu do desejo de proporcionar às mulheres uma curadoria especial de moda que une elegância, conforto e sofisticação em cada detalhe.
        </p>

        <h2>Nossa Filosofia</h2>
        <p>
          Acreditamos que vestir-se bem é uma forma de expressão pessoal e autoestima. Cada peça selecionada em nosso catálogo passa por uma criteriosa avaliação de qualidade, caimento e tendência, garantindo versatilidade para o dia a dia e para ocasiões marcantes.
        </p>

        <h2>Compromisso com a Cliente</h2>
        <p>
          Oferecemos uma experiência de compra transparente, segura e acolhedora — desde a navegação na loja até o recebimento e acompanhamento do seu pedido em tempo real.
        </p>

        <div className="institucional-alerta">
          <strong>Nota de Transparência:</strong> As informações societárias completas (CNPJ, razão social e endereço de atendimento) serão preenchidas formalmente pelo proprietário do estabelecimento antes da inauguração comercial pública.
        </div>
      </div>
      <Footer onNavegar={onNavegar} />
    </div>
  )
}
