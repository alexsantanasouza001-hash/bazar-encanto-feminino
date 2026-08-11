import { useEffect, useState } from 'react'
import './Pedidos.css'

const CHAVE_PEDIDOS = 'meu_bazar_pedidos'

const STATUS = [
  'Confirmado',
  'Em preparação',
  'Enviado',
  'Concluído'
]

function carregarPedidos() {
  const dados = localStorage.getItem(CHAVE_PEDIDOS)

  if (!dados) {
    return []
  }

  try {
    const pedidos = JSON.parse(dados)

    if (!Array.isArray(pedidos)) {
      return []
    }

    return pedidos
  } catch (erro) {
    console.error('Erro ao carregar pedidos:', erro)
    return []
  }
}

function salvarPedidos(pedidos) {
  localStorage.setItem(
    CHAVE_PEDIDOS,
    JSON.stringify(pedidos)
  )

  window.dispatchEvent(
    new Event('pedidos-atualizados')
  )
}

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  )
}

function formatarData(data) {
  if (!data) {
    return '--'
  }

  const dataPedido = new Date(data)

  if (Number.isNaN(dataPedido.getTime())) {
    return '--'
  }

  return dataPedido.toLocaleDateString('pt-BR')
}

function formatarHora(data) {
  if (!data) {
    return '--'
  }

  const dataPedido = new Date(data)

  if (Number.isNaN(dataPedido.getTime())) {
    return '--'
  }

  return dataPedido.toLocaleTimeString(
    'pt-BR',
    {
      hour: '2-digit',
      minute: '2-digit'
    }
  )
}

function obterProdutos(pedido) {
  if (Array.isArray(pedido.produtos)) {
    return pedido.produtos
  }

  if (Array.isArray(pedido.itens)) {
    return pedido.itens
  }

  if (Array.isArray(pedido.carrinho)) {
    return pedido.carrinho
  }

  return []
}

function obterNomeCliente(pedido) {
  return (
    pedido.nomeCliente ||
    pedido.cliente ||
    pedido.nome ||
    'Cliente não informada'
  )
}

function obterDataPedido(pedido) {
  return (
    pedido.data ||
    pedido.dataPedido ||
    pedido.createdAt ||
    pedido.criadoEm ||
    null
  )
}

function obterNumeroPedido(pedido, indice) {
  if (pedido.numero) {
    return pedido.numero
  }

  if (pedido.id) {
    return String(pedido.id).slice(-6)
  }

  return String(indice + 1).padStart(4, '0')
}

function obterStatus(pedido) {
  if (!pedido.status) {
    return 'Confirmado'
  }

  const status = String(
    pedido.status
  ).toLowerCase().trim()

  if (status === 'novo') {
    return 'Confirmado'
  }

  if (
    status === 'confirmado' ||
    status === 'confirmada'
  ) {
    return 'Confirmado'
  }

  if (
    status === 'em preparação' ||
    status === 'em preparacao'
  ) {
    return 'Em preparação'
  }

  if (status === 'enviado') {
    return 'Enviado'
  }

  if (
    status === 'concluído' ||
    status === 'concluido'
  ) {
    return 'Concluído'
  }

  return 'Confirmado'
}

function obterTotal(pedido, produtos) {
  if (
    pedido.total !== undefined &&
    pedido.total !== null
  ) {
    return Number(pedido.total || 0)
  }

  if (
    pedido.valorTotal !== undefined &&
    pedido.valorTotal !== null
  ) {
    return Number(
      pedido.valorTotal || 0
    )
  }

  return produtos.reduce(
    (total, produto) => {
      const quantidade = Number(
        produto.quantidade || 1
      )

      const preco = Number(
        produto.preco ??
        produto.venda ??
        produto.valor ??
        0
      )

      return (
        total +
        preco * quantidade
      )
    },
    0
  )
}

function obterIndiceStatus(status) {
  const indice = STATUS.indexOf(status)

  if (indice < 0) {
    return 0
  }

  return indice
}

function Pedidos() {
  const [pedidos, setPedidos] = useState([])

  useEffect(() => {
    const atualizarPedidos = () => {
      setPedidos(
        carregarPedidos()
      )
    }

    atualizarPedidos()

    window.addEventListener(
      'pedidos-atualizados',
      atualizarPedidos
    )

    window.addEventListener(
      'storage',
      atualizarPedidos
    )

    return () => {
      window.removeEventListener(
        'pedidos-atualizados',
        atualizarPedidos
      )

      window.removeEventListener(
        'storage',
        atualizarPedidos
      )
    }
  }, [])

  const alterarStatus = (
    pedido,
    novoStatus
  ) => {
    const pedidosAtuais =
      carregarPedidos()

    const pedidosAtualizados =
      pedidosAtuais.map(
        (item) => {
          const mesmoId =
            pedido.id &&
            item.id &&
            String(item.id) ===
              String(pedido.id)

          const mesmoNumero =
            pedido.numero &&
            item.numero &&
            String(item.numero) ===
              String(pedido.numero)

          if (
            mesmoId ||
            mesmoNumero
          ) {
            return {
              ...item,
              status: novoStatus,
              atualizadoEm:
                new Date().toISOString()
            }
          }

          return item
        }
      )

    salvarPedidos(
      pedidosAtualizados
    )

    setPedidos(
      pedidosAtualizados
    )
  }

  const pedidosHoje = pedidos.filter(
    (pedido) => {
      const data =
        obterDataPedido(pedido)

      if (!data) {
        return false
      }

      const dataPedido =
        new Date(data)

      const hoje =
        new Date()

      return (
        dataPedido.getDate() ===
          hoje.getDate() &&
        dataPedido.getMonth() ===
          hoje.getMonth() &&
        dataPedido.getFullYear() ===
          hoje.getFullYear()
      )
    }
  ).length

  const pedidosConfirmados =
    pedidos.filter(
      (pedido) =>
        obterStatus(pedido) ===
        'Confirmado'
    ).length

  const valorTotalPedidos =
    pedidos.reduce(
      (total, pedido) => {
        const produtos =
          obterProdutos(pedido)

        return (
          total +
          obterTotal(
            pedido,
            produtos
          )
        )
      },
      0
    )

  return (
    <div className="pedidos-page">

      <div className="pedidos-header">
        <div>

          <span className="pedidos-eyebrow">
            BAZAR ENCANTO FEMININO
          </span>

          <h1>
            Pedidos
          </h1>

          <p>
            Acompanhe os pedidos realizados pelas clientes.
          </p>

        </div>
      </div>

      <div className="pedidos-cards">

        <div className="pedido-card">

          <div className="pedido-card-icon">
            ◇
          </div>

          <div>

            <span>
              Pedidos hoje
            </span>

            <strong>
              {pedidosHoje}
            </strong>

          </div>

        </div>

        <div className="pedido-card">

          <div className="pedido-card-icon">
            ✓
          </div>

          <div>

            <span>
              Pedidos confirmados
            </span>

            <strong>
              {pedidosConfirmados}
            </strong>

          </div>

        </div>

        <div className="pedido-card">

          <div className="pedido-card-icon">
            $
          </div>

          <div>

            <span>
              Total de pedidos
            </span>

            <strong>
              {formatarPreco(
                valorTotalPedidos
              )}
            </strong>

          </div>

        </div>

      </div>

      <div className="pedidos-panel">

        <div className="pedidos-panel-header">

          <div>

            <span>
              VENDAS
            </span>

            <h2>
              Histórico de pedidos
            </h2>

            <p>
              Confira os pedidos recebidos pela loja.
            </p>

          </div>

          <div className="pedidos-total-label">
            {pedidos.length} pedido
            {pedidos.length !== 1
              ? 's'
              : ''}
          </div>

        </div>

        {pedidos.length === 0 ? (

          <div className="pedidos-vazio">

            <div className="pedidos-vazio-icon">
              ◇
            </div>

            <strong>
              Nenhum pedido realizado
            </strong>

            <span>
              Quando uma cliente fizer um pedido pelo aplicativo,
              ele aparecerá nesta área.
            </span>

          </div>

        ) : (

          <div className="pedidos-lista">

            {pedidos
              .slice()
              .reverse()
              .map(
                (
                  pedido,
                  indice
                ) => {

                  const produtos =
                    obterProdutos(
                      pedido
                    )

                  const total =
                    obterTotal(
                      pedido,
                      produtos
                    )

                  const cliente =
                    obterNomeCliente(
                      pedido
                    )

                  const data =
                    obterDataPedido(
                      pedido
                    )

                  const status =
                    obterStatus(
                      pedido
                    )

                  const indiceStatus =
                    obterIndiceStatus(
                      status
                    )

                  return (
                    <article
                      className="pedido-ticket"
                      key={
                        pedido.id ||
                        pedido.numero ||
                        indice
                      }
                    >

                      <div className="ticket-top">

                        <div className="ticket-order">

                          <span>
                            PEDIDO
                          </span>

                          <strong>
                            #
                            {obterNumeroPedido(
                              pedido,
                              indice
                            )}
                          </strong>

                        </div>

                        <div className="ticket-status">
                          {status}
                        </div>

                      </div>

                      <div className="ticket-divider" />

                      <div className="ticket-client">

                        <div className="ticket-client-icon">
                          ♡
                        </div>

                        <div>

                          <span>
                            CLIENTE
                          </span>

                          <strong>
                            {cliente}
                          </strong>

                        </div>

                        <div className="ticket-date">

                          <span>
                            DATA
                          </span>

                          <strong>
                            {formatarData(
                              data
                            )}
                          </strong>

                          <small>
                            {formatarHora(
                              data
                            )}
                          </small>

                        </div>

                      </div>

                      <div className="ticket-divider" />

                      <div className="ticket-progress-area">

                        <div className="ticket-progress-title">

                          <span>
                            ANDAMENTO DO PEDIDO
                          </span>

                          <strong>
                            {status}
                          </strong>

                        </div>

                        <div className="ticket-progress">

                          {STATUS.map(
                            (
                              itemStatus,
                              statusIndex
                            ) => {

                              const ativo =
                                statusIndex <=
                                indiceStatus

                              const atual =
                                statusIndex ===
                                indiceStatus

                              return (
                                <div
                                  className={
                                    ativo
                                      ? 'progress-step active'
                                      : 'progress-step'
                                  }
                                  key={
                                    itemStatus
                                  }
                                >

                                  <div className="progress-dot">

                                    {ativo
                                      ? '✓'
                                      : ''}

                                  </div>

                                  <span>
                                    {itemStatus}
                                  </span>

                                </div>
                              )
                            }
                          )}

                        </div>

                      </div>

                      <div className="ticket-divider" />

                      <div className="ticket-products">

                        <div className="ticket-products-header">

                          <span>
                            PRODUTO
                          </span>

                          <span>
                            TAM.
                          </span>

                          <span>
                            QTD.
                          </span>

                          <span>
                            VALOR
                          </span>

                        </div>

                        {produtos.length === 0 ? (

                          <div className="ticket-no-products">
                            Nenhum produto registrado.
                          </div>

                        ) : (

                          produtos.map(
                            (
                              produto,
                              produtoIndex
                            ) => {

                              const quantidade =
                                Number(
                                  produto.quantidade ||
                                  1
                                )

                              const preco =
                                Number(
                                  produto.preco ??
                                  produto.venda ??
                                  produto.valor ??
                                  0
                                )

                              const subtotal =
                                preco *
                                quantidade

                              return (
                                <div
                                  className="ticket-product-row"
                                  key={
                                    produto.id ||
                                    produtoIndex
                                  }
                                >

                                  <div className="ticket-product-name">

                                    <strong>
                                      {produto.nome ||
                                        'Produto'}
                                    </strong>

                                    {produto.marca && (
                                      <small>
                                        {produto.marca}
                                      </small>
                                    )}

                                  </div>

                                  <span>
                                    {produto.tamanho ||
                                      '-'}
                                  </span>

                                  <span>
                                    {quantidade}
                                  </span>

                                  <strong>
                                    {formatarPreco(
                                      subtotal
                                    )}
                                  </strong>

                                </div>
                              )
                            }
                          )

                        )}

                      </div>

                      <div className="ticket-divider" />

                      <div className="ticket-bottom">

                        <span>
                          TOTAL DO PEDIDO
                        </span>

                        <strong>
                          {formatarPreco(
                            total
                          )}
                        </strong>

                      </div>

                      <div className="ticket-status-actions">

                        {STATUS.map(
                          (itemStatus) => {

                            const ativo =
                              status ===
                              itemStatus

                            return (
                              <button
                                type="button"
                                key={
                                  itemStatus
                                }
                                className={
                                  ativo
                                    ? 'status-action active'
                                    : 'status-action'
                                }
                                onClick={() =>
                                  alterarStatus(
                                    pedido,
                                    itemStatus
                                  )
                                }
                              >
                                {itemStatus}
                              </button>
                            )
                          }
                        )}

                      </div>

                      <div className="ticket-footer">
                        Bazar Encanto Feminino
                      </div>

                    </article>
                  )
                }
              )}

          </div>

        )}

      </div>

    </div>
  )
}

export default Pedidos