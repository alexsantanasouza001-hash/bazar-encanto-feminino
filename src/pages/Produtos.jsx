import { useEffect, useState } from 'react'

import ProductForm from '../components/ProductForm'

import {
  carregarProdutos,
  adicionarProduto,
  atualizarProduto,
  removerProduto,
  alterarAtivoProduto
} from '../storage'

function Produtos() {
  const [
    mostrarFormulario,
    setMostrarFormulario
  ] = useState(false)

  const [
    produtoEditando,
    setProdutoEditando
  ] = useState(null)

  const [
    produtos,
    setProdutos
  ] = useState([])

  const [
    busca,
    setBusca
  ] = useState('')

  const [
    categoriaFiltro,
    setCategoriaFiltro
  ] = useState('Todas')

  const [
    tamanhoFiltro,
    setTamanhoFiltro
  ] = useState('Todos')

  const [statusFiltro, setStatusFiltro] = useState('Todos')

  const [
    carregando,
    setCarregando
  ] = useState(true)

  // =====================================================
  // CARREGAR PRODUTOS
  // =====================================================

  useEffect(() => {
    let ativo = true

    async function carregarDados() {
      try {
        setCarregando(true)

        const produtosSalvos =
          await carregarProdutos(true)

        if (!ativo) {
          return
        }

        setProdutos(
          Array.isArray(
            produtosSalvos
          )
            ? produtosSalvos
            : []
        )
      } catch (erro) {
        console.error(
          'Erro ao carregar produtos:',
          erro
        )

        if (ativo) {
          setProdutos([])
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
  // ADICIONAR
  // =====================================================

  const handleAdicionarProduto =
    async (novoProduto) => {
      try {
        const produto =
          await adicionarProduto(
            novoProduto
          )

        if (!produto) {
          return
        }

        const produtosAtualizados =
          await carregarProdutos(true)

        setProdutos(
          Array.isArray(
            produtosAtualizados
          )
            ? produtosAtualizados
            : []
        )

        setMostrarFormulario(
          false
        )

        setProdutoEditando(null)
      } catch (erro) {
        console.error(
          'Erro ao adicionar produto:',
          erro
        )

        window.alert(
          'Não foi possível adicionar o produto.'
        )
      }
    }

  // =====================================================
  // EDITAR
  // =====================================================

  const handleEditar = (
    produto
  ) => {
    setProdutoEditando(
      produto
    )

    setMostrarFormulario(
      true
    )
  }

  // =====================================================
  // ATUALIZAR
  // =====================================================

  const handleAtualizarProduto =
    async (
      produtoAtualizado
    ) => {
      try {
        await atualizarProduto(
          produtoAtualizado
        )

        const produtosAtualizados =
          await carregarProdutos(true)

        setProdutos(
          Array.isArray(
            produtosAtualizados
          )
            ? produtosAtualizados
            : []
        )

        setProdutoEditando(
          null
        )

        setMostrarFormulario(
          false
        )
      } catch (erro) {
        console.error(
          'Erro ao atualizar produto:',
          erro
        )

        window.alert(
          'Não foi possível atualizar o produto.'
        )
      }
    }

  // =====================================================
  // EXCLUIR
  // =====================================================

  const handleExcluir =
    async (id) => {
      const produto =
        produtos.find(
          (item) =>
            String(
              item.id
            ) ===
            String(id)
        )

      if (!produto) {
        return
      }

      const confirmou =
        window.confirm(
          `Deseja realmente excluir "${produto.nome}"?`
        )

      if (!confirmou) {
        return
      }

      try {
        const novosProdutos =
          await removerProduto(
            id
          )

        setProdutos(
          Array.isArray(
            novosProdutos
          )
            ? novosProdutos
            : []
        )
      } catch (erro) {
        console.error(
          'Erro ao excluir produto:',
          erro
        )

        window.alert(
          'Não foi possível excluir o produto.'
        )
      }
    }

  // =====================================================
  // NOVO
  // =====================================================

  const abrirNovoProduto =
    () => {
      setProdutoEditando(
        null
      )

      setMostrarFormulario(
        true
      )
    }

  const alternarAtivo = async (produto) => {
    try {
      setProdutos(await alterarAtivoProduto(produto.id, produto.ativo === false))
    } catch (erro) {
      console.error('Erro ao alterar visibilidade do produto:', erro)
      window.alert('Não foi possível alterar a visibilidade do produto.')
    }
  }

  // =====================================================
  // FILTROS
  // =====================================================

  const produtosFiltrados =
    Array.isArray(produtos)
      ? produtos.filter(
          (produto) => {
            const textoBusca =
              busca
                .trim()
                .toLowerCase()

            const nome =
              String(
                produto?.nome ||
                  ''
              ).toLowerCase()

            const marca =
              String(
                produto?.marca ||
                  ''
              ).toLowerCase()

            const sku =
              String(
                produto?.sku ||
                  ''
              ).toLowerCase()

            const correspondeBusca =
              textoBusca ===
                '' ||
              nome.includes(
                textoBusca
              ) ||
              marca.includes(
                textoBusca
              ) ||
              sku.includes(
                textoBusca
              )

            const correspondeCategoria =
              categoriaFiltro ===
                'Todas' ||
              String(
                produto?.categoria ||
                  ''
              ) ===
                categoriaFiltro

            const correspondeStatus =
              statusFiltro === 'Todos' ||
              (statusFiltro === 'Ativos' && produto.ativo !== false) ||
              (statusFiltro === 'Inativos' && produto.ativo === false)

            let correspondeTamanho =
              true

            if (
              tamanhoFiltro !==
              'Todos'
            ) {
              if (
                Array.isArray(
                  produto?.tamanhos
                )
              ) {
                correspondeTamanho =
                  produto.tamanhos.some(
                    (item) =>
                      String(
                        item.tamanho
                      ) ===
                        tamanhoFiltro &&
                      Number(
                        item.quantidade ||
                          0
                      ) > 0
                  )
              } else {
                correspondeTamanho =
                  String(
                    produto?.tamanho ||
                      ''
                  )
                    .split(',')
                    .map(
                      (item) =>
                        item.trim()
                    )
                    .includes(
                      tamanhoFiltro
                    )
              }
            }

            return (
              correspondeBusca &&
              correspondeCategoria &&
              correspondeTamanho &&
              correspondeStatus
            )
          }
        )
      : []

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div>

      <div className="produtos-header">

        <div>
          <h1>
            Produtos
          </h1>

          <p>
            Gerencie as peças do seu bazar
          </p>
        </div>

        <button
          type="button"
          className="novo-produto"
          onClick={
            abrirNovoProduto
          }
        >
          + Novo produto
        </button>

      </div>

      <div className="produtos-filtros">

        <input
          type="text"
          placeholder="🔎  Buscar por nome, marca ou SKU..."
          value={
            busca
          }
          onChange={(e) =>
            setBusca(
              e.target.value
            )
          }
        />

        <select
          value={
            categoriaFiltro
          }
          onChange={(e) =>
            setCategoriaFiltro(
              e.target.value
            )
          }
        >
          <option value="Todas">
            Todas as categorias
          </option>

          <option value="Vestidos">
            Vestidos
          </option>

          <option value="Blusas">
            Blusas
          </option>

          <option value="Calças">
            Calças
          </option>

          <option value="Shorts">
            Shorts
          </option>

          <option value="Saias">
            Saias
          </option>

          <option value="Conjuntos">
            Conjuntos
          </option>

          <option value="Outros">
            Outros
          </option>
        </select>

        <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
          <option value="Todos">Todos os status</option>
          <option value="Ativos">Ativos</option>
          <option value="Inativos">Inativos</option>
        </select>

        <select
          value={
            tamanhoFiltro
          }
          onChange={(e) =>
            setTamanhoFiltro(
              e.target.value
            )
          }
        >
          <option value="Todos">
            Todos os tamanhos
          </option>

          <option value="PP">
            PP
          </option>

          <option value="P">
            P
          </option>

          <option value="M">
            M
          </option>

          <option value="G">
            G
          </option>

          <option value="GG">
            GG
          </option>

          <option value="36">
            36
          </option>

          <option value="38">
            38
          </option>

          <option value="40">
            40
          </option>

          <option value="42">
            42
          </option>

          <option value="44">
            44
          </option>

          <option value="46">
            46
          </option>
        </select>

      </div>

      <div className="produtos-tabela">

        <table>

          <thead>
            <tr>
              <th>
                Produto
              </th>

              <th>
                Categoria
              </th>

              <th>
                Tamanhos
              </th>

              <th>
                Estoque
              </th>

              <th>
                Custo
              </th>

              <th>
                Venda
              </th>

              <th>Status</th>

              <th>
                Lucro
              </th>

              <th>
                Ações
              </th>
            </tr>
          </thead>

          <tbody>

            {carregando ? (

              <tr>
                <td
                  colSpan="9"
                  style={{
                    textAlign:
                      'center',
                    padding:
                      '40px'
                  }}
                >
                  Carregando produtos...
                </td>
              </tr>

            ) : produtosFiltrados.length ===
              0 ? (

              <tr>
                <td
                  colSpan="9"
                  style={{
                    textAlign:
                      'center',
                    padding:
                      '40px'
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
                      produto?.quantidade ||
                        0
                    )

                  const custo =
                    Number(
                      produto?.custo ||
                        0
                    )

                  const venda =
                    Number(
                      produto?.venda ||
                        0
                    )

                  const lucro =
                    Number.isFinite(
                      Number(
                        produto?.lucro
                      )
                    )
                      ? Number(
                          produto.lucro
                        )
                      : venda -
                        custo

                  const tamanhosTexto =
                    Array.isArray(
                      produto?.tamanhos
                    )
                      ? produto.tamanhos
                          .filter(
                            (item) =>
                              Number(
                                item.quantidade ||
                                  0
                              ) > 0
                          )
                          .map(
                            (item) =>
                              `${item.tamanho}: ${item.quantidade}`
                          )
                          .join(
                            ' | '
                          )
                      : produto?.tamanho ||
                        '-'

                  return (

                    <tr
                      key={
                        produto.id
                      }
                    >

                      <td>

                        <strong>
                          {
                            produto?.nome ||
                            'Produto sem nome'
                          }
                        </strong>

                        <br />

                        <small>
                          {
                            produto?.marca ||
                            ''
                          }
                        </small>

                      </td>

                      <td>
                        {
                          produto?.categoria ||
                          '-'
                        }
                      </td>

                      <td>
                        {tamanhosTexto}
                      </td>

                      <td>

                        <span
                          className={
                            quantidade ===
                            0
                              ? 'estoque-zero'
                              : quantidade <=
                                  2
                                ? 'estoque-baixo'
                                : ''
                          }
                        >
                          {
                            quantidade
                          }
                        </span>

                      </td>

                      <td>
                        R${' '}
                        {custo.toFixed(
                          2
                        )}
                      </td>

                      <td>
                        R${' '}
                        {venda.toFixed(
                          2
                        )}
                      </td>

                      <td>
                        <span
                          className={
                            produto.ativo === false
                              ? 'produto-inativo'
                              : 'produto-ativo'
                          }
                        >
                          {produto.ativo === false ? 'Inativo' : 'Ativo'}
                        </span>
                      </td>

                      <td>

                        <strong>
                          R${' '}
                          {lucro.toFixed(
                            2
                          )}
                        </strong>

                      </td>

                      <td>

                        <div className="product-actions">

                          <button
                            type="button"
                            className="action-toggle"
                            onClick={() => alternarAtivo(produto)}
                            title={produto.ativo === false ? 'Ativar' : 'Desativar'}
                          >
                            {produto.ativo === false ? 'Ativar' : 'Desativar'}
                          </button>

                          <button
                            type="button"
                            className="action-edit"
                            onClick={() =>
                              handleEditar(
                                produto
                              )
                            }
                            title="Editar"
                          >
                            ✏️
                          </button>

                          <button
                            type="button"
                            className="action-delete"
                            onClick={() =>
                              handleExcluir(
                                produto.id
                              )
                            }
                            title="Excluir"
                          >
                            🗑️
                          </button>

                        </div>

                      </td>

                    </tr>

                  )
                }
              )

            )}

          </tbody>

        </table>

      </div>

      {mostrarFormulario && (

        <ProductForm
          onClose={() => {
            setMostrarFormulario(
              false
            )

            setProdutoEditando(
              null
            )
          }}
          onAddProduct={
            handleAdicionarProduto
          }
          onUpdateProduct={
            handleAtualizarProduto
          }
          produtoEditando={
            produtoEditando
          }
        />

      )}

    </div>
  )
}

export default Produtos
