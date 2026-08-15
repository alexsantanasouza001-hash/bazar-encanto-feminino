import { useEffect, useState } from 'react'

import {
  carregarProdutos,
  carregarMovimentacoes
} from '../storage'

import EntradaEstoque from '../components/EntradaEstoque'
import SaidaEstoque from '../components/SaidaEstoque'

function Estoque() {
  const [produtos, setProdutos] = useState([])
  const [movimentacoes, setMovimentacoes] = useState([])
  const [mostrarEntrada, setMostrarEntrada] = useState(false)
  const [mostrarSaida, setMostrarSaida] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState(
    'Todas as categorias'
  )
  const [statusFiltro, setStatusFiltro] = useState(
    'Todos os status'
  )

  // =====================================================
  // NORMALIZAR PRODUTO
  // =====================================================

  function normalizarProduto(produto) {
    if (!produto || typeof produto !== 'object') {
      return null
    }

    return {
      ...produto,

      id:
        produto.id ??
        produto.produto_id ??
        Date.now(),

      nome:
        produto.nome ??
        produto.name ??
        '',

      marca:
        produto.marca ??
        '',

      categoria:
        produto.categoria ??
        '',

      tamanho:
        produto.tamanho ??
        '',

      cor:
        produto.cor ??
        '',

      sku:
        produto.sku ??
        '',

      quantidade:
        Number(
          produto.quantidade ??
          produto.estoque ??
          0
        ),

      custo:
        Number(
          produto.custo ??
          0
        ),

      venda:
        Number(
          produto.venda ??
          produto.preco ??
          produto.preco_venda ??
          0
        ),

      foto:
        produto.foto ??
        produto.imagem ??
        produto.image ??
        null
    }
  }

  // =====================================================
  // NORMALIZAR MOVIMENTAÇÃO
  // =====================================================

  function normalizarMovimentacao(movimentacao) {
    if (
      !movimentacao ||
      typeof movimentacao !== 'object'
    ) {
      return null
    }

    return {
      ...movimentacao,

      id:
        movimentacao.id ??
        Date.now(),

      produtoId:
        movimentacao.produtoId ??
        movimentacao.produto_id ??
        null,

      produtoNome:
        movimentacao.produtoNome ??
        movimentacao.produto_nome ??
        '',

      tipo:
        movimentacao.tipo ??
        '',

      quantidade:
        Number(
          movimentacao.quantidade ??
          0
        ),

      estoqueAnterior:
        Number(
          movimentacao.estoqueAnterior ??
          movimentacao.estoque_anterior ??
          0
        ),

      estoqueAtual:
        Number(
          movimentacao.estoqueAtual ??
          movimentacao.estoque_atual ??
          0
        ),

      observacao:
        movimentacao.observacao ??
        '',

      data:
        movimentacao.data ??
        movimentacao.created_at ??
        null
    }
  }

  // =====================================================
  // CARREGAR DADOS
  // =====================================================

  useEffect(() => {
    let ativo = true

    async function carregarDados() {
      try {
        setCarregando(true)

        const [
          produtosSalvos,
          movimentacoesSalvas
        ] = await Promise.all([
          carregarProdutos(),
          carregarMovimentacoes()
        ])

        if (!ativo) {
          return
        }

        const produtosNormalizados =
          Array.isArray(produtosSalvos)
            ? produtosSalvos
                .map(normalizarProduto)
                .filter(Boolean)
            : []

        const movimentacoesNormalizadas =
          Array.isArray(
            movimentacoesSalvas
          )
            ? movimentacoesSalvas
                .map(normalizarMovimentacao)
                .filter(Boolean)
            : []
        setProdutos(
          produtosNormalizados
        )

        setMovimentacoes(
          movimentacoesNormalizadas
        )
      } catch (erro) {
        console.error(
          'Erro ao carregar estoque:',
          erro
        )

        if (ativo) {
          setProdutos([])
          setMovimentacoes([])
        }
      } finally {
        if (ativo) {
          setCarregando(false)
        }
      }
    }

    carregarDados()

    return () => {
      ativo = false
    }
  }, [])

  // =====================================================
  // ATUALIZAR DADOS
  // =====================================================

  async function atualizarDados() {
    try {
      const [
        produtosAtualizados,
        movimentacoesAtualizadas
      ] = await Promise.all([
        carregarProdutos(),
        carregarMovimentacoes()
      ])

      const produtosNormalizados =
        Array.isArray(
          produtosAtualizados
        )
          ? produtosAtualizados
              .map(normalizarProduto)
              .filter(Boolean)
          : []

      const movimentacoesNormalizadas =
        Array.isArray(
          movimentacoesAtualizadas
        )
          ? movimentacoesAtualizadas
              .map(normalizarMovimentacao)
              .filter(Boolean)
          : []

      setProdutos(
        produtosNormalizados
      )

      setMovimentacoes(
        movimentacoesNormalizadas
      )
    } catch (erro) {
      console.error(
        'Erro ao atualizar estoque:',
        erro
      )
    }
  }

  // =====================================================
  // INDICADORES
  // =====================================================

  const totalPecas =
    produtos.reduce(
      (total, produto) =>
        total +
        Number(
          produto.quantidade || 0
        ),
      0
    )

  const estoqueBaixo =
    produtos.filter(
      (produto) => {
        const quantidade =
          Number(
            produto.quantidade || 0
          )

        return (
          quantidade > 0 &&
          quantidade <= 2
        )
      }
    ).length

  const semEstoque =
    produtos.filter(
      (produto) =>
        Number(
          produto.quantidade || 0
        ) === 0
    ).length

  const estoqueNormal =
    produtos.length -
    estoqueBaixo -
    semEstoque

  // =====================================================
  // DATA
  // =====================================================

  function formatarData(data) {
    if (!data) {
      return '-'
    }

    const dataFormatada =
      new Date(data)

    if (
      Number.isNaN(
        dataFormatada.getTime()
      )
    ) {
      return '-'
    }

    return dataFormatada.toLocaleString(
      'pt-BR',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }
    )
  }

  // =====================================================
  // FILTROS
  // =====================================================

  const produtosFiltrados =
    produtos.filter(
      (produto) => {
        const quantidade =
          Number(
            produto.quantidade || 0
          )

        let status =
          'Estoque normal'

        if (quantidade === 0) {
          status = 'Sem estoque'
        } else if (
          quantidade <= 2
        ) {
          status = 'Estoque baixo'
        }

        const textoBusca =
          busca
            .trim()
            .toLowerCase()

        const nomeProduto =
          String(
            produto.nome || ''
          ).toLowerCase()

        const skuProduto =
          String(
            produto.sku || ''
          ).toLowerCase()

        const correspondeBusca =
          textoBusca === '' ||
          nomeProduto.includes(
            textoBusca
          ) ||
          skuProduto.includes(
            textoBusca
          )

        const categoriaProduto =
          String(
            produto.categoria || ''
          )
            .trim()
            .toLowerCase()

        const categoriaSelecionada =
          categoriaFiltro
            .trim()
            .toLowerCase()

        const correspondeCategoria =
          categoriaFiltro ===
            'Todas as categorias' ||
          categoriaProduto ===
            categoriaSelecionada

        const correspondeStatus =
          statusFiltro ===
            'Todos os status' ||
          status ===
            statusFiltro

        return (
          correspondeBusca &&
          correspondeCategoria &&
          correspondeStatus
        )
      }
    )

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div>

      {/* CABEÇALHO */}

      <div className="produtos-header">

        <div>
          <h1>Estoque</h1>

          <p>
            Controle de todas as peças
            do seu bazar
          </p>
        </div>

        <div className="estoque-botoes">

          <button
            type="button"
            className="botao-estoque"
            onClick={() =>
              setMostrarSaida(true)
            }
          >
            − Saída de estoque
          </button>

          <button
            type="button"
            className="botao-estoque"
            onClick={() =>
              setMostrarEntrada(true)
            }
          >
            + Entrada de estoque
          </button>

        </div>

      </div>

      {/* CARDS */}

      <div className="cards estoque-cards">

        <div className="card">

          <div className="card-icon">
            📦
          </div>

          <div>
            <span>
              Total de peças
            </span>

            <h2>
              {totalPecas}
            </h2>

            <small>
              Em estoque
            </small>
          </div>

        </div>

        <div className="card">

          <div className="card-icon">
            🟢
          </div>

          <div>
            <span>
              Estoque normal
            </span>

            <h2>
              {estoqueNormal}
            </h2>

            <small>
              Produtos
            </small>
          </div>

        </div>

        <div className="card">

          <div className="card-icon">
            🟠
          </div>

          <div>
            <span>
              Estoque baixo
            </span>

            <h2>
              {estoqueBaixo}
            </h2>

            <small>
              Precisam de atenção
            </small>
          </div>

        </div>

        <div className="card">

          <div className="card-icon">
            🔴
          </div>

          <div>
            <span>
              Sem estoque
            </span>

            <h2>
              {semEstoque}
            </h2>

            <small>
              Produtos zerados
            </small>
          </div>

        </div>

      </div>

      {/* FILTROS */}

      <div className="produtos-filtros">

        <input
          type="text"
          placeholder="🔎  Buscar produto ou SKU..."
          value={busca}
          onChange={(e) =>
            setBusca(e.target.value)
          }
        />

        <select
          value={categoriaFiltro}
          onChange={(e) =>
            setCategoriaFiltro(
              e.target.value
            )
          }
        >
          <option>
            Todas as categorias
          </option>

          <option>
            Vestidos
          </option>

          <option>
            Blusas
          </option>

          <option>
            Calças
          </option>

          <option>
            Shorts
          </option>
        </select>

        <select
          value={statusFiltro}
          onChange={(e) =>
            setStatusFiltro(
              e.target.value
            )
          }
        >
          <option>
            Todos os status
          </option>

          <option>
            Estoque normal
          </option>

          <option>
            Estoque baixo
          </option>

          <option>
            Sem estoque
          </option>
        </select>

      </div>

      {/* TABELA */}

      <div className="produtos-tabela">

        <table>

          <thead>
            <tr>
              <th>Produto</th>
              <th>SKU</th>
              <th>Tamanho</th>
              <th>Quantidade</th>
              <th>Status</th>
              <th>Preço</th>
            </tr>
          </thead>

          <tbody>

            {carregando ? (

              <tr>
                <td
                  colSpan="6"
                  style={{
                    textAlign: 'center',
                    padding: '40px'
                  }}
                >
                  Carregando estoque...
                </td>
              </tr>

            ) : produtosFiltrados.length === 0 ? (

              <tr>
                <td
                  colSpan="6"
                  style={{
                    textAlign: 'center',
                    padding: '30px'
                  }}
                >
                  Nenhum produto encontrado.
                </td>
              </tr>

            ) : (

              produtosFiltrados.map(
                (produto) => {

                  const quantidade =
                    Number(
                      produto.quantidade ||
                      0
                    )

                  let status =
                    'Normal'

                  let classe =
                    'paid'

                  if (
                    quantidade === 0
                  ) {
                    status =
                      'Sem estoque'

                    classe =
                      'out-stock'

                  } else if (
                    quantidade <= 2
                  ) {
                    status =
                      'Estoque baixo'

                    classe =
                      'pending'
                  }

                  return (
                    <tr
                      key={
                        produto.id
                      }
                    >

                      <td>
                        {produto.nome ||
                          'Produto sem nome'}
                      </td>

                      <td>
                        {produto.sku ||
                          '-'}
                      </td>

                      <td>
                        {produto.tamanho ||
                          '-'}
                      </td>

                      <td>
                        {quantidade}
                      </td>

                      <td>

                        <span
                          className={
                            'status ' +
                            classe
                          }
                        >
                          {status}
                        </span>

                      </td>

                      <td>
                        {'R$ ' +
                          Number(
                            produto.venda ||
                            0
                          ).toFixed(2)}
                      </td>

                    </tr>
                  )
                }
              )

            )}

          </tbody>

        </table>

      </div>

      {/* HISTÓRICO */}

      <div className="panel estoque-historico">

        <div className="panel-header">

          <div>

            <h3>
              Histórico de movimentações
            </h3>

            <p>
              Acompanhe as entradas e
              saídas do estoque
            </p>

          </div>

        </div>

        {movimentacoes.length === 0 ? (

          <div className="historico-vazio">

            <div className="historico-vazio-icon">
              📋
            </div>

            <strong>
              Nenhuma movimentação
              registrada
            </strong>

            <span>
              As entradas e saídas
              aparecerão aqui.
            </span>

          </div>

        ) : (

          <div className="historico-tabela">

            <table>

              <thead>

                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>
                    Estoque anterior
                  </th>
                  <th>
                    Estoque atual
                  </th>
                  <th>
                    Observação
                  </th>
                </tr>

              </thead>

              <tbody>

                {[
                  ...movimentacoes
                ]
                  .reverse()
                  .map(
                    (
                      movimentacao
                    ) => (

                      <tr
                        key={
                          movimentacao.id
                        }
                      >

                        <td>
                          {formatarData(
                            movimentacao.data
                          )}
                        </td>

                        <td>
                          <strong>
                            {
                              movimentacao.produtoNome ||
                              'Produto'
                            }
                          </strong>
                        </td>

                        <td>

                          <span
                            className={
                              movimentacao.tipo ===
                              'entrada'
                                ? 'movimento-entrada'
                                : 'movimento-saida'
                            }
                          >
                            {
                              movimentacao.tipo ===
                              'entrada'
                                ? '↑ Entrada'
                                : '↓ Saída'
                            }
                          </span>

                        </td>

                        <td>

                          <strong
                            className={
                              movimentacao.tipo ===
                              'entrada'
                                ? 'quantidade-entrada'
                                : 'quantidade-saida'
                            }
                          >
                            {
                              movimentacao.tipo ===
                              'entrada'
                                ? '+'
                                : '-'
                            }

                            {
                              movimentacao.quantidade
                            }
                          </strong>

                        </td>

                        <td>
                          {
                            movimentacao.estoqueAnterior
                          }
                        </td>

                        <td>

                          <strong>
                            {
                              movimentacao.estoqueAtual
                            }
                          </strong>

                        </td>

                        <td>
                          {
                            movimentacao.observacao ||
                            '-'
                          }
                        </td>

                      </tr>

                    )
                  )}

              </tbody>

            </table>

          </div>

        )}

      </div>

      {/* ENTRADA */}

      {mostrarEntrada && (

        <EntradaEstoque
          produtos={produtos}

          onClose={() =>
            setMostrarEntrada(
              false
            )
          }

          onSuccess={async (
            novosProdutos
          ) => {

            if (
              Array.isArray(
                novosProdutos
              )
            ) {
              setProdutos(
                novosProdutos
                  .map(
                    normalizarProduto
                  )
                  .filter(Boolean)
              )
            }

            await atualizarDados()

            setMostrarEntrada(
              false
            )
          }}
        />

      )}

      {/* SAÍDA */}

      {mostrarSaida && (

        <SaidaEstoque
          produtos={produtos}

          onClose={() =>
            setMostrarSaida(
              false
            )
          }

          onSuccess={async (
            novosProdutos
          ) => {

            if (
              Array.isArray(
                novosProdutos
              )
            ) {
              setProdutos(
                novosProdutos
                  .map(
                    normalizarProduto
                  )
                  .filter(Boolean)
              )
            }

            await atualizarDados()

            setMostrarSaida(
              false
            )
          }}
        />

      )}

    </div>
  )
}

export default Estoque