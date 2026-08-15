import { useEffect, useState } from 'react'
import './Pedidos.css'

import {
  carregarPedidos as carregarPedidosSupabase,
  atualizarStatusPedido
} from '../storage'
import {
  obterStatusPedido as obterStatus,
  obterTransicoesPedido
} from './statusHelpers'

const STATUS = [
  'Aguardando pagamento',
  'Confirmado',
  'Em preparação',
  'Enviado',
  'Entregue',
  'Concluído',
  'Cancelado'
]

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
    return -1
  }

  return indice
}

function Pedidos() {
  const [pedidos, setPedidos] = useState([])
  const [envioPorPedido, setEnvioPorPedido] = useState({})
  const [atualizandoPedido, setAtualizandoPedido] = useState(null)

  useEffect(() => {
    let ativo = true

    async function atualizarPedidos() {
      try {
        const pedidosSupabase =
          await carregarPedidosSupabase()

        if (!ativo) {
          return
        }

        setPedidos(
          Array.isArray(
            pedidosSupabase
          )
            ? pedidosSupabase
            : []
        )
      } catch (erro) {
        console.error(
          'Erro ao carregar pedidos do Supabase:',
          erro
        )

        if (ativo) {
          setPedidos([])
        }
      }
    }

    atualizarPedidos()

    return () => {
      ativo = false
    }
  }, [])

  const alterarStatus = (
    pedido,
    novoStatus,
    dadosEnvio = {}
  ) => {
    if (
      !pedido?.id ||
        obterStatus(pedido?.status) === novoStatus
    ) {
      return
    }

    async function atualizarStatus() {
      try {
        if (
          novoStatus === 'Cancelado' &&
          !window.confirm('Confirma o cancelamento deste pedido? Pagamentos aprovados não serão reembolsados automaticamente.')
        ) {
          return
        }

        setAtualizandoPedido(pedido.id)

        const pedidosAtualizados =
          await atualizarStatusPedido(
            pedido.id,
            novoStatus,
            dadosEnvio
          )

        if (!Array.isArray(pedidosAtualizados)) {
          throw new Error(
            'A atualização não retornou os pedidos.'
          )
        }

        setPedidos(pedidosAtualizados)
        setEnvioPorPedido((atual) => ({ ...atual, [pedido.id]: undefined }))
      } catch (erro) {
        console.error(
          'Erro ao atualizar status do pedido:',
          erro
        )

        window.alert(
          'Não foi possível atualizar o status do pedido.'
        )
      } finally {
        setAtualizandoPedido(null)
      }
    }

    atualizarStatus()
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
        obterStatus(pedido.status) ===
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
                      pedido.status
                    )

                  const indiceStatus =
                    obterIndiceStatus(
                      status
                    )

                  const possuiEntrega =
                    Boolean(
                      pedido.cep_entrega
                    )

                  const formaPagamento =
                    pedido.forma_pagamento ||
                    'Não informado'

                  const statusPagamento =
                    pedido.status_pagamento === 'aprovado'
                      ? 'Pago'
                      : pedido.status_pagamento === 'recusado'
                        ? 'Recusado'
                        : pedido.status_pagamento === 'cancelado'
                          ? 'Cancelado'
                          : pedido.status_pagamento === 'expirado'
                            ? 'Expirado'
                            : pedido.status_pagamento === 'reembolsado'
                              ? 'Reembolsado'
                              : pedido.status_pagamento === 'pendente'
                                ? 'Aguardando'
                                : 'Legado / não informado'

                  const enderecoEntrega = [
                    pedido.endereco_entrega,
                    pedido.numero_entrega,
                    pedido.complemento_entrega,
                    pedido.bairro_entrega,
                    pedido.cidade_entrega &&
                      pedido.estado_entrega
                      ? `${pedido.cidade_entrega} - ${pedido.estado_entrega}`
                      : pedido.cidade_entrega ||
                        pedido.estado_entrega
                  ].filter(Boolean).join(', ')

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

                      {possuiEntrega && (
                        <div className="ticket-delivery">
                          <span>ENTREGA</span>
                          <strong>{enderecoEntrega}</strong>
                          <small>CEP {pedido.cep_entrega}</small>
                        </div>
                      )}

                      <div className="ticket-payment">
                        <span>PAGAMENTO</span>
                        <strong>{formaPagamento}</strong>
                        <small>{statusPagamento}</small>
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

                          {STATUS.filter((item) => item !== 'Cancelado').map(
                            (
                              itemStatus,
                              statusIndex
                            ) => {

                              const ativo =
                                status !== 'Cancelado' &&
                                statusIndex <= indiceStatus

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

                      {possuiEntrega && (
                        <div className="ticket-financials">
                          <span>Subtotal</span>
                          <strong>{formatarPreco(pedido.subtotal)}</strong>
                          <span>Desconto</span>
                          <strong>−{formatarPreco(pedido.desconto)}</strong>
                          <span>Envio</span>
                          <strong>
                            {Number(pedido.valor_frete || 0) === 0
                              ? 'GRÁTIS'
                              : formatarPreco(pedido.valor_frete)}
                          </strong>
                        </div>
                      )}

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

                      {(pedido.transportadora || pedido.codigo_rastreio || pedido.url_rastreio) && (
                        <div className="ticket-tracking">
                          <span>RASTREAMENTO</span>
                          {pedido.transportadora && <strong>{pedido.transportadora}</strong>}
                          {pedido.codigo_rastreio && <code>{pedido.codigo_rastreio}</code>}
                          {pedido.url_rastreio && (
                            <a href={pedido.url_rastreio} target="_blank" rel="noreferrer">
                              Acompanhar entrega
                            </a>
                          )}
                        </div>
                      )}

                      {obterTransicoesPedido(status).includes('Enviado') && (
                        <div className="ticket-shipping-form">
                          <label>
                            Transportadora
                            <input
                              type="text"
                              maxLength="120"
                              value={envioPorPedido[pedido.id]?.transportadora || ''}
                              onChange={(evento) => setEnvioPorPedido((atual) => ({
                                ...atual,
                                [pedido.id]: {
                                  ...atual[pedido.id],
                                  transportadora: evento.target.value
                                }
                              }))}
                            />
                          </label>
                          <label>
                            Código de rastreio
                            <input
                              type="text"
                              maxLength="120"
                              value={envioPorPedido[pedido.id]?.codigoRastreio || ''}
                              onChange={(evento) => setEnvioPorPedido((atual) => ({
                                ...atual,
                                [pedido.id]: {
                                  ...atual[pedido.id],
                                  codigoRastreio: evento.target.value
                                }
                              }))}
                            />
                          </label>
                          <label className="ticket-shipping-url">
                            URL de rastreio (opcional)
                            <input
                              type="url"
                              placeholder="https://"
                              maxLength="500"
                              value={envioPorPedido[pedido.id]?.urlRastreio || ''}
                              onChange={(evento) => setEnvioPorPedido((atual) => ({
                                ...atual,
                                [pedido.id]: {
                                  ...atual[pedido.id],
                                  urlRastreio: evento.target.value
                                }
                              }))}
                            />
                          </label>
                        </div>
                      )}

                      <div className="ticket-status-actions">
                        {obterTransicoesPedido(status).map((itemStatus) => (
                          <button
                            type="button"
                            key={itemStatus}
                            className="status-action"
                            disabled={atualizandoPedido === pedido.id}
                            onClick={() => alterarStatus(
                              pedido,
                              itemStatus,
                              itemStatus === 'Enviado' ? envioPorPedido[pedido.id] : undefined
                            )}
                          >
                            {atualizandoPedido === pedido.id
                              ? 'Atualizando...'
                              : itemStatus === 'Cancelado'
                                ? 'Cancelar pedido'
                                : `Marcar como ${itemStatus}`}
                          </button>
                        ))}

                        {obterTransicoesPedido(status).length === 0 && (
                          <span className="ticket-terminal-status">
                            Nenhuma transição disponível.
                          </span>
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
