import './Footer.css'

export default function Footer({ onNavegar }) {
  const navegarPara = (caminho, evento) => {
    if (evento) evento.preventDefault()
    if (onNavegar) {
      onNavegar(caminho)
    } else {
      window.location.href = caminho
    }
  }

  return (
    <footer className="footer-loja">
      <div className="footer-container">
        <div className="footer-brand">
          <div className="footer-logo">Bazar Encanto Feminino</div>
          <p className="footer-desc">
            Curadoria exclusiva de moda feminina. Elegância, sofisticação e o encanto que valoriza sua beleza natural em cada ocasião.
          </p>
        </div>

        <div className="footer-col">
          <h4>Navegação</h4>
          <ul>
            <li>
              <a href="/" onClick={(e) => navegarPara('/', e)}>Início</a>
            </li>
            <li>
              <a href="/#produtos" onClick={(e) => navegarPara('/#produtos', e)}>Coleção de Produtos</a>
            </li>
            <li>
              <a href="/acompanhar-pedido" onClick={(e) => navegarPara('/acompanhar-pedido', e)}>Acompanhar Pedido</a>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Institucional</h4>
          <ul>
            <li>
              <a href="/sobre" onClick={(e) => navegarPara('/sobre', e)}>Sobre a Marca</a>
            </li>
            <li>
              <a href="/politica-de-privacidade" onClick={(e) => navegarPara('/politica-de-privacidade', e)}>Política de Privacidade</a>
            </li>
            <li>
              <a href="/termos" onClick={(e) => navegarPara('/termos', e)}>Termos e Condições</a>
            </li>
            <li>
              <a href="/trocas-e-devolucoes" onClick={(e) => navegarPara('/trocas-e-devolucoes', e)}>Trocas e Devoluções</a>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Pagamento Seguro</h4>
          <p className="footer-desc">Transações processadas com segurança via Mercado Pago.</p>
          <div className="pagamentos-badges">
            <span className="badge-pagamento">❖ Pix (Aprovação Instantânea)</span>
            <span className="badge-pagamento">💳 Cartão de Crédito</span>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div>
          © {new Date().getFullYear()} Bazar Encanto Feminino. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  )
}
