import { useEffect, useState } from 'react'
import './Loja.css'

import {
  carregarProdutos,
  registrarPedido
} from '../storage'

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  )
}

function Loja() {
  const [produtos, setProdutos] = useState([])
  const [categoriaAtiva, setCategoriaAtiva] =
    useState('Todos')

  const [carrinho, setCarrinho] = useState([])
  const [nomeCliente, setNomeCliente] =
    useState('')

  const [carrinhoAberto, setCarrinhoAberto] =
    useState(false)

  // =====================================================
  // CARREGAR PRODUTOS
  // =====================================================

  useEffect(() => {
    let ativo = true

    async function carregar() {
      try {
        const produtosSalvos =
          await carregarProdutos()

        if (
          ativo &&
          Array.isArray(produtosSalvos)
        ) {
          setProdutos(produtosSalvos)
        }
      } catch (erro) {
        console.error(
          'Erro ao carregar produtos da loja:',
          erro
        )

        if (ativo) {
          setProdutos([])
        }
      }
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [])

  // =====================================================
  // CATEGORIAS
  // =====================================================

  const categorias = [
    'Todos',
    'Vestidos',
    'Blusas',
    'Calças',
    'Shorts',
    'Saias',
    'Conjuntos',
    'Outros'
  ]

  // =====================================================
  // PRODUTOS DISPONÍVEIS
  // =====================================================

  const produtosDisponiveis =
    produtos.filter((produto) => {
      const estoque = Number(
        produto.quantidade || 0
      )

      if (estoque <= 0) {
        return false
      }

      if (categoriaAtiva === 'Todos') {
        return true
      }

      return (
        String(
          produto.categoria || ''
        ).trim().toLowerCase() ===
        String(
          categoriaAtiva
        ).trim().toLowerCase()
      )
    })

  // =====================================================
  // ADICIONAR AO CARRINHO
  // =====================================================

  const adicionarCarrinho = (produto) => {
    const estoque = Number(
      produto.quantidade || 0
    )

    if (estoque <= 0) {
      alert(
        'Este produto está sem estoque.'
      )
      return
    }

    const itemExistente =
      carrinho.find(
        (item) =>
          String(item.id) ===
          String(produto.id)
      )

    const quantidadeAtual =
      itemExistente
        ? Number(
            itemExistente.quantidade || 0
          )
        : 0

    if (quantidadeAtual >= estoque) {
      alert(
        'Você atingiu o limite de estoque disponível para "' +
          produto.nome +
          '".'
      )
      return
    }

    if (itemExistente) {
      setCarrinho(
        (carrinhoAtual) =>
          carrinhoAtual.map((item) =>
            String(item.id) ===
            String(produto.id)
              ? {
                  ...item,
                  quantidade:
                    Number(
                      item.quantidade || 0
                    ) + 1
                }
              : item
          )
      )
    } else {
      setCarrinho(
        (carrinhoAtual) => [
          ...carrinhoAtual,
          {
            ...produto,
            quantidade: 1
          }
        ]
      )
    }

    setCarrinhoAberto(true)
  }

  // =====================================================
  // AUMENTAR QUANTIDADE
  // =====================================================

  const aumentarQuantidade = (id) => {
    const produtoOriginal =
      produtos.find(
        (produto) =>
          String(produto.id) ===
          String(id)
      )

    if (!produtoOriginal) {
      return
    }

    const estoque = Number(
      produtoOriginal.quantidade || 0
    )

    const itemCarrinho =
      carrinho.find(
        (item) =>
          String(item.id) ===
          String(id)
      )

    if (!itemCarrinho) {
      return
    }

    if (
      Number(
        itemCarrinho.quantidade || 0
      ) >= estoque
    ) {
      alert(
        'Não há mais unidades disponíveis deste produto.'
      )
      return
    }

    setCarrinho(
      (carrinhoAtual) =>
        carrinhoAtual.map((item) =>
          String(item.id) ===
          String(id)
            ? {
                ...item,
                quantidade:
                  Number(
                    item.quantidade || 0
                  ) + 1
              }
            : item
        )
    )
  }

  // =====================================================
  // DIMINUIR QUANTIDADE
  // =====================================================

  const diminuirQuantidade = (id) => {
    setCarrinho(
      (carrinhoAtual) =>
        carrinhoAtual
          .map((item) =>
            String(item.id) ===
            String(id)
              ? {
                  ...item,
                  quantidade:
                    Number(
                      item.quantidade || 0
                    ) - 1
                }
              : item
          )
          .filter(
            (item) =>
              Number(
                item.quantidade || 0
              ) > 0
          )
    )
  }

  // =====================================================
  // REMOVER DO CARRINHO
  // =====================================================

  const removerProduto = (id) => {
    setCarrinho(
      (carrinhoAtual) =>
        carrinhoAtual.filter(
          (item) =>
            String(item.id) !==
            String(id)
        )
    )
  }

  // =====================================================
  // TOTAIS
  // =====================================================

  const quantidadeTotal =
    carrinho.reduce(
      (total, item) =>
        total +
        Number(
          item.quantidade || 0
        ),
      0
    )

  const valorTotal =
    carrinho.reduce(
      (total, item) =>
        total +
        Number(
          item.venda || 0
        ) *
          Number(
            item.quantidade || 0
          ),
      0
    )

  // =====================================================
  // FINALIZAR PEDIDO
  // =====================================================

  const finalizarPedidoWhatsApp =
    async () => {
      const nome =
        nomeCliente.trim()

      if (!nome) {
        alert(
          'Digite o nome da cliente antes de finalizar o pedido.'
        )
        return
      }

      if (carrinho.length === 0) {
        alert(
          'Adicione pelo menos um produto ao carrinho.'
        )
        return
      }

      try {
        const resultado =
          await registrarPedido({
            nomeCliente: nome,
            itens: carrinho
          })

        if (
          !resultado ||
          resultado.sucesso !== true
        ) {
          alert(
            resultado?.mensagem ||
              'Não foi possível registrar o pedido.'
          )
          return
        }

        const pedido =
          resultado.pedido

        const numeroPedido =
          pedido?.numero ||
          `PED-${String(
            pedido?.id ||
              Date.now()
          ).slice(-6)}`

        const produtosPedido =
          Array.isArray(
            pedido?.itens
          )
            ? pedido.itens
            : carrinho

        let mensagem =
          'Olá! Gostaria de fazer um pedido.\n\n'

        mensagem +=
          '*Pedido #' +
          numeroPedido +
          '*\n'

        mensagem +=
          '*Cliente:* ' +
          nome +
          '\n\n'

        mensagem +=
          '*Produtos do pedido:*\n'

        produtosPedido.forEach(
          (item) => {
            const quantidade =
              Number(
                item.quantidade || 0
              )

            const preco =
              Number(
                item.preco ??
                  item.venda ??
                  0
              )

            const subtotal =
              Number(
                item.subtotal ??
                  preco *
                    quantidade
              )

            mensagem +=
              '\n• ' +
              (item.nome || 'Produto') +
              '\n'

            if (item.marca) {
              mensagem +=
                '  Marca: ' +
                item.marca +
                '\n'
            }

            if (item.tamanho) {
              mensagem +=
                '  Tamanho: ' +
                item.tamanho +
                '\n'
            }

            if (item.cor) {
              mensagem +=
                '  Cor: ' +
                item.cor +
                '\n'
            }

            mensagem +=
              '  Quantidade: ' +
              quantidade +
              '\n'

            mensagem +=
              '  Valor: ' +
              formatarPreco(
                subtotal
              ) +
              '\n'
          }
        )

        const totalPedido =
          Number(
            pedido?.total ??
              valorTotal
          )

        mensagem +=
          '\n*Total do pedido: ' +
          formatarPreco(
            totalPedido
          ) +
          '*'

        const numeroWhatsApp =
          '5521978889491'

        const url =
          'https://wa.me/' +
          numeroWhatsApp +
          '?text=' +
          encodeURIComponent(
            mensagem
          )

        if (
          Array.isArray(
            resultado.produtos
          )
        ) {
          setProdutos(
            resultado.produtos
          )
        } else {
          const produtosAtualizados =
            await carregarProdutos()

          if (
            Array.isArray(
              produtosAtualizados
            )
          ) {
            setProdutos(
              produtosAtualizados
            )
          }
        }

        setCarrinho([])
        setNomeCliente('')
        setCarrinhoAberto(false)

        window.open(
          url,
          '_blank'
        )
      } catch (erro) {
        console.error(
          'Erro ao finalizar pedido:',
          erro
        )

        alert(
          'Ocorreu um erro ao registrar o pedido.'
        )
      }
    }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="loja-page">

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="loja-header">

        <div className="loja-brand">

          <div className="loja-brand-symbol">
            ✿
          </div>

          <div className="loja-brand-text">

            <span>
              Bazar
            </span>

            <strong>
              Encanto Feminino
            </strong>

          </div>

        </div>

        <button
          className="loja-cart-button"
          type="button"
          onClick={() =>
            setCarrinhoAberto(true)
          }
        >

          <span className="loja-cart-icon">
            🛍
          </span>

          <span>
            Carrinho
          </span>

          {quantidadeTotal > 0 && (
            <strong className="loja-cart-count">
              {quantidadeTotal}
            </strong>
          )}

        </button>

      </header>

      {/* =================================================
          HERO
      ================================================= */}

      <section className="loja-hero">

        <div className="loja-hero-content">

          <span className="loja-hero-eyebrow">
            BAZAR ENCANTO FEMININO
          </span>

          <h1>
            Moda que encanta.
          </h1>

          <p>
            Encontre peças especiais para
            deixar seu look ainda mais bonito.
          </p>

        </div>

        <div className="loja-hero-decoration">
          ✿
        </div>

      </section>

      {/* =================================================
          CATEGORIAS
      ================================================= */}

      <section className="loja-categorias">

        {categorias.map(
          (categoria) => (
            <button
              key={categoria}
              type="button"
              className={
                'categoria-button ' +
                (
                  categoriaAtiva ===
                  categoria
                    ? 'active'
                    : ''
                )
              }
              onClick={() =>
                setCategoriaAtiva(
                  categoria
                )
              }
            >
              {categoria}
            </button>
          )
        )}

      </section>

      {/* =================================================
          CONTEÚDO
      ================================================= */}

      <main className="loja-conteudo">

        <div className="loja-section-header">

          <div>

            <span>
              NOSSA SELEÇÃO
            </span>

            <h2>
              Produtos em destaque
            </h2>

          </div>

          <p>
            Escolha suas peças favoritas
          </p>

        </div>

        {produtosDisponiveis.length ===
        0 ? (

          <div className="loja-sem-produtos">

            <div>
              ✿
            </div>

            <strong>
              Nenhum produto disponível
            </strong>

            <span>
              Não encontramos produtos
              nessa categoria.
            </span>

          </div>

        ) : (

          <div className="loja-produtos">

            {produtosDisponiveis.map(
              (produto) => (

                <article
                  className="loja-produto-card"
                  key={produto.id}
                >

                  <div className="loja-produto-foto">

                    {produto.foto ? (

                      <img
                        src={produto.foto}
                        alt={
                          produto.nome ||
                          'Produto'
                        }
                      />

                    ) : (

                      <div className="loja-foto-placeholder">
                        ✿
                      </div>

                    )}

                    <span className="loja-produto-categoria">
                      {produto.categoria ||
                        'Produto'}
                    </span>

                  </div>

                  <div className="loja-produto-info">

                    <h3>
                      {produto.nome ||
                        'Produto'}
                    </h3>

                    {produto.marca && (
                      <span className="loja-produto-marca">
                        {produto.marca}
                      </span>
                    )}

                    {produto.cor && (
                      <span className="loja-produto-cor">
                        Cor: {produto.cor}
                      </span>
                    )}

                    {produto.tamanho && (
                      <div className="loja-tamanhos">

                        <span>
                          {produto.tamanho}
                        </span>

                      </div>
                    )}

                    <div className="loja-produto-bottom">

                      <strong>
                        {formatarPreco(
                          produto.venda
                        )}
                      </strong>

                      <button
                        type="button"
                        onClick={() =>
                          adicionarCarrinho(
                            produto
                          )
                        }
                      >
                        +
                      </button>

                    </div>

                  </div>

                </article>

              )
            )}

          </div>

        )}

      </main>

      {/* =================================================
          CARRINHO
      ================================================= */}

      {carrinhoAberto && (

        <div
          className="loja-cart-overlay"
          onClick={(evento) => {

            if (
              evento.target ===
              evento.currentTarget
            ) {
              setCarrinhoAberto(false)
            }

          }}
        >

          <aside className="loja-cart-sidebar">

            <div className="loja-cart-header">

              <div>

                <span>
                  SEU PEDIDO
                </span>

                <h2>
                  Carrinho
                </h2>

              </div>

              <button
                type="button"
                className="loja-cart-close"
                onClick={() =>
                  setCarrinhoAberto(
                    false
                  )
                }
              >
                ×
              </button>

            </div>

            {carrinho.length === 0 ? (

              <div className="loja-cart-empty">

                <div>
                  🛍
                </div>

                <strong>
                  Seu carrinho está vazio
                </strong>

                <p>
                  Adicione algumas peças
                  para continuar.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setCarrinhoAberto(
                      false
                    )
                  }
                >
                  Ver produtos
                </button>

              </div>

            ) : (

              <>

                <div className="loja-cart-items">

                  {carrinho.map(
                    (item) => (

                      <div
                        className="loja-cart-item"
                        key={item.id}
                      >

                        <div className="loja-cart-item-image">

                          {item.foto ? (

                            <img
                              src={item.foto}
                              alt={
                                item.nome ||
                                'Produto'
                              }
                            />

                          ) : (

                            <span>
                              ✿
                            </span>

                          )}

                        </div>

                        <div className="loja-cart-item-info">

                          <strong>
                            {item.nome}
                          </strong>

                          {item.tamanho && (
                            <span>
                              Tamanho{' '}
                              {item.tamanho}
                            </span>
                          )}

                          <small>
                            {formatarPreco(
                              item.venda
                            )}
                          </small>

                          <div className="loja-quantity">

                            <button
                              type="button"
                              onClick={() =>
                                diminuirQuantidade(
                                  item.id
                                )
                              }
                            >
                              −
                            </button>

                            <span>
                              {item.quantidade}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                aumentarQuantidade(
                                  item.id
                                )
                              }
                            >
                              +
                            </button>

                          </div>

                        </div>

                        <button
                          className="loja-remove"
                          type="button"
                          onClick={() =>
                            removerProduto(
                              item.id
                            )
                          }
                        >
                          ×
                        </button>

                      </div>

                    )
                  )}

                </div>

                <div className="loja-cart-footer">

                  <div className="loja-client-data">

                    <label>
                      Nome da cliente
                    </label>

                    <input
                      type="text"
                      value={nomeCliente}
                      onChange={(evento) =>
                        setNomeCliente(
                          evento.target.value
                        )
                      }
                      placeholder="Digite seu nome"
                    />

                  </div>

                  <div className="loja-cart-total">

                    <span>
                      Total do pedido
                    </span>

                    <strong>
                      {formatarPreco(
                        valorTotal
                      )}
                    </strong>

                  </div>

                  <button
                    className="loja-whatsapp-button"
                    type="button"
                    onClick={
                      finalizarPedidoWhatsApp
                    }
                  >

                    <span>
                      WhatsApp
                    </span>

                    <strong>
                      Enviar pedido
                    </strong>

                  </button>

                  <p className="loja-cart-note">
                    Seu pedido será enviado
                    para nossa equipe pelo
                    WhatsApp.
                  </p>

                </div>

              </>

            )}

          </aside>

        </div>

      )}

    </div>
  )
}

export default Loja