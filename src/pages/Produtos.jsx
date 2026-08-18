import { useEffect, useState } from 'react'
import './Produtos.css'

import ProductForm from '../components/ProductForm'

import {
  carregarProdutos,
  adicionarProduto,
  atualizarProduto,
  removerProduto,
  alterarAtivoProduto,
  carregarRemessas
} from '../storage'
import { calcularSaldoConsignadoItem } from './revendasHelpers.js'

function Produtos({ papelUsuario = 'admin' }) {
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [produtoEditando, setProdutoEditando] = useState(null)
  const [produtos, setProdutos] = useState([])
  const [remessas, setRemessas] = useState([])
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas')
  const [tamanhoFiltro, setTamanhoFiltro] = useState('Todos')
  const [statusFiltro, setStatusFiltro] = useState('Ativos')
  const [carregando, setCarregando] = useState(true)

  // =====================================================
  // CARREGAR DADOS
  // =====================================================

  useEffect(() => {
    let ativo = true

    async function carregarDados() {
      try {
        setCarregando(true)

        const [produtosSalvos, remessasSalvas] = await Promise.all([
          carregarProdutos(true),
          carregarRemessas()
        ])

        if (!ativo) return

        setProdutos(Array.isArray(produtosSalvos) ? produtosSalvos : [])
        setRemessas(Array.isArray(remessasSalvas) ? remessasSalvas : [])
      } catch (erro) {
        console.error('Erro ao carregar produtos:', erro)
        if (ativo) {
          setProdutos([])
          setRemessas([])
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
  // HELPER CONSIGNAÇÃO
  // =====================================================

  function calcularConsignadoProduto(produtoId) {
    let total = 0
    for (const rem of remessas) {
      for (const item of (rem.itens || [])) {
        if (Number(item.produto_id) === Number(produtoId)) {
          total += calcularSaldoConsignadoItem(item)
        }
      }
    }
    return total
  }

  // =====================================================
  // ADICIONAR
  // =====================================================

  const handleAdicionarProduto = async (novoProduto) => {
    try {
      const produto = await adicionarProduto(novoProduto)
      if (!produto) return

      const produtosAtualizados = await carregarProdutos(true)
      setProdutos(Array.isArray(produtosAtualizados) ? produtosAtualizados : [])
      setMostrarFormulario(false)
      setProdutoEditando(null)
    } catch (erro) {
      console.error('Erro ao adicionar produto:', erro)
      window.alert('Não foi possível adicionar o produto.')
    }
  }

  // =====================================================
  // EDITAR
  // =====================================================

  const handleEditar = (produto) => {
    setProdutoEditando(produto)
    setMostrarFormulario(true)
  }

  // =====================================================
  // ATUALIZAR
  // =====================================================

  const handleAtualizarProduto = async (produtoAtualizado) => {
    try {
      await atualizarProduto(produtoAtualizado)
      const produtosAtualizados = await carregarProdutos(true)
      setProdutos(Array.isArray(produtosAtualizados) ? produtosAtualizados : [])
      setProdutoEditando(null)
      setMostrarFormulario(false)
    } catch (erro) {
      console.error('Erro ao atualizar produto:', erro)
      window.alert('Não foi possível atualizar o produto.')
    }
  }

  // =====================================================
  // EXCLUIR
  // =====================================================

  const handleExcluir = async (id) => {
    if (papelUsuario === 'operador') {
      window.alert('Acesso restrito: Operadores não possuem permissão para excluir produtos. Use a opção Arquivar.')
      return
    }

    const produto = produtos.find((item) => String(item.id) === String(id))
    if (!produto) return

    const saldoConsig = calcularConsignadoProduto(produto.id)
    if (saldoConsig > 0) {
      window.alert(
        `Não é possível excluir este produto pois existem ${saldoConsig} peça(s) em consignação com revendedoras. Recolha ou encerre as remessas primeiro.`
      )
      return
    }

    const confirmou = window.confirm(
      `Deseja realmente excluir "${produto.nome}"?\n\nImportante: Para produtos que não serão mais vendidos, a melhor prática é usar "Arquivar" para preservar o histórico de vendas e relatórios.`
    )
    if (!confirmou) return

    try {
      const novosProdutos = await removerProduto(id)
      setProdutos(Array.isArray(novosProdutos) ? novosProdutos : [])
    } catch (erro) {
      console.error('Erro ao excluir produto:', erro)
      window.alert('Não foi possível excluir o produto. Caso possua histórico, use a opção Arquivar.')
    }
  }

  // =====================================================
  // NOVO
  // =====================================================

  const abrirNovoProduto = () => {
    setProdutoEditando(null)
    setMostrarFormulario(true)
  }

  // =====================================================
  // ARQUIVAR / REATIVAR
  // =====================================================

  const alternarAtivo = async (produto) => {
    try {
      const estaAtivo = produto.ativo !== false

      if (estaAtivo) {
        // Tentando Arquivar
        const saldoConsig = calcularConsignadoProduto(produto.id)
        if (saldoConsig > 0) {
          window.alert(
            `Atenção: Não é possível arquivar silenciosamente.\n\nEste produto possui ${saldoConsig} peça(s) em consignação ativa com revendedoras.\nRecolha ou acerte as remessas consignadas antes de arquivar o produto.`
          )
          return
        }

        const confirmou = window.confirm(
          `Deseja arquivar o produto "${produto.nome}"?\n\nEle será ocultado da loja pública e da listagem padrão do Estoque, mantendo todo o histórico de vendas e financeiro intacto.`
        )
        if (!confirmou) return

        const novosProdutos = await alterarAtivoProduto(produto.id, false)
        setProdutos(Array.isArray(novosProdutos) ? novosProdutos : [])
      } else {
        // Reativando
        const confirmou = window.confirm(
          `Deseja reativar o produto "${produto.nome}"?\n\nEle voltará a ser exibido no Estoque e na Loja pública.`
        )
        if (!confirmou) return

        const novosProdutos = await alterarAtivoProduto(produto.id, true)
        setProdutos(Array.isArray(novosProdutos) ? novosProdutos : [])
      }
    } catch (erro) {
      console.error('Erro ao alterar status do produto:', erro)
      window.alert('Não foi possível alterar o status do produto.')
    }
  }

  // =====================================================
  // FILTROS
  // =====================================================

  const produtosFiltrados = Array.isArray(produtos)
    ? produtos.filter((produto) => {
        const textoBusca = busca.trim().toLowerCase()
        const nome = String(produto?.nome || '').toLowerCase()
        const marca = String(produto?.marca || '').toLowerCase()
        const sku = String(produto?.sku || '').toLowerCase()

        const correspondeBusca =
          textoBusca === '' ||
          nome.includes(textoBusca) ||
          marca.includes(textoBusca) ||
          sku.includes(textoBusca)

        const correspondeCategoria =
          categoriaFiltro === 'Todas' ||
          String(produto?.categoria || '') === categoriaFiltro

        const correspondeStatus =
          statusFiltro === 'Todos' ||
          (statusFiltro === 'Ativos' && produto.ativo !== false) ||
          (statusFiltro === 'Arquivados' && produto.ativo === false) ||
          (statusFiltro === 'Inativos' && produto.ativo === false)

        let correspondeTamanho = true
        if (tamanhoFiltro !== 'Todos') {
          if (Array.isArray(produto?.tamanhos)) {
            correspondeTamanho = produto.tamanhos.some(
              (item) =>
                String(item.tamanho) === tamanhoFiltro &&
                Number(item.quantidade || 0) > 0
            )
          } else {
            correspondeTamanho = String(produto?.tamanho || '')
              .split(',')
              .map((item) => item.trim())
              .includes(tamanhoFiltro)
          }
        }

        return (
          correspondeBusca &&
          correspondeCategoria &&
          correspondeStatus &&
          correspondeTamanho
        )
      })
    : []

  const totalPecas = produtos.reduce((total, produto) => {
    if (produto.ativo === false) return total
    if (Array.isArray(produto.tamanhos) && produto.tamanhos.length > 0) {
      return total + produto.tamanhos.reduce((soma, t) => soma + Number(t.quantidade || 0), 0)
    }
    return total + Number(produto.quantidade || 0)
  }, 0)

  const totalInvestido = produtos.reduce((total, produto) => {
    if (produto.ativo === false) return total
    let qtd = Number(produto.quantidade || 0)
    if (Array.isArray(produto.tamanhos) && produto.tamanhos.length > 0) {
      qtd = produto.tamanhos.reduce((soma, t) => soma + Number(t.quantidade || 0), 0)
    }
    return total + Number(produto.custo || 0) * qtd
  }, 0)

  const potencialVenda = produtos.reduce((total, produto) => {
    if (produto.ativo === false) return total
    let qtd = Number(produto.quantidade || 0)
    if (Array.isArray(produto.tamanhos) && produto.tamanhos.length > 0) {
      qtd = produto.tamanhos.reduce((soma, t) => soma + Number(t.quantidade || 0), 0)
    }
    return total + Number(produto.venda || 0) * qtd
  }, 0)

  const lucroEstimado = potencialVenda - totalInvestido

  return (
    <div className="produtos-page">
      {/* CABEÇALHO */}
      <div className="produtos-header">
        <div className="produtos-header-title">
          <h1>Produtos</h1>
          <p>Cadastre e gerencie todas as peças do seu bazar com fotos, tamanhos e valores</p>
        </div>

        <button
          type="button"
          className="novo-produto"
          onClick={abrirNovoProduto}
        >
          <span>+</span> Cadastrar produto
        </button>
      </div>

      {/* CARDS DE RESUMO */}
      <div className="produtos-cards">
        <div className="card">
          <div className="card-icon">🏷️</div>
          <div>
            <span>Total de modelos</span>
            <h2>{produtos.length}</h2>
            <small>{produtos.filter((p) => p.ativo !== false).length} ativos / {produtos.filter((p) => p.ativo === false).length} arquivados</small>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">📦</div>
          <div>
            <span>Peças ativas</span>
            <h2>{totalPecas} un.</h2>
            <small>Disponíveis na loja</small>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">💰</div>
          <div>
            <span>Custo do estoque</span>
            <h2>R$ {totalInvestido.toFixed(2)}</h2>
            <small>Investimento ativo</small>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">📈</div>
          <div>
            <span>Lucro potencial</span>
            <h2>R$ {lucroEstimado.toFixed(2)}</h2>
            <small>Margem estimada</small>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS E BUSCA */}
      <div className="produtos-filtros">
        <input
          type="text"
          placeholder="🔎  Buscar por nome, marca ou SKU..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        <select
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value)}
        >
          <option value="Ativos">Apenas Ativos (Padrão)</option>
          <option value="Arquivados">Produtos Arquivados</option>
          <option value="Todos">Todos os produtos</option>
        </select>

        <select
          value={categoriaFiltro}
          onChange={(e) => setCategoriaFiltro(e.target.value)}
        >
          <option value="Todas">Todas as categorias</option>
          <option value="Vestidos">Vestidos</option>
          <option value="Blusas">Blusas</option>
          <option value="Calças">Calças</option>
          <option value="Shorts">Shorts</option>
          <option value="Saias">Saias</option>
          <option value="Conjuntos">Conjuntos</option>
          <option value="Outros">Outros</option>
        </select>

        <select
          value={tamanhoFiltro}
          onChange={(e) => setTamanhoFiltro(e.target.value)}
        >
          <option value="Todos">Todos os tamanhos</option>
          <option value="PP">PP</option>
          <option value="P">P</option>
          <option value="M">M</option>
          <option value="G">G</option>
          <option value="GG">GG</option>
          <option value="36">36</option>
          <option value="38">38</option>
          <option value="40">40</option>
          <option value="42">42</option>
          <option value="44">44</option>
          <option value="46">46</option>
        </select>
      </div>

      {/* TABELA DE PRODUTOS */}
      <div className="produtos-tabela">
        <table>
          <thead>
            <tr>
              <th className="produto-col-foto">Foto</th>
              <th>Produto / Marca</th>
              <th>Categoria</th>
              <th>Grade / Tamanhos</th>
              <th>Estoque</th>
              <th>Custo</th>
              <th>Venda</th>
              <th>Status</th>
              <th>Lucro unid.</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {carregando ? (
              <tr>
                <td
                  colSpan="10"
                  style={{ textAlign: 'center', padding: '50px 20px', color: '#7b8567' }}
                >
                  Carregando catálogo de produtos...
                </td>
              </tr>
            ) : produtosFiltrados.length === 0 ? (
              <tr>
                <td
                  colSpan="10"
                  style={{ textAlign: 'center', padding: '40px 20px', color: '#7b8567' }}
                >
                  {statusFiltro === 'Arquivados'
                    ? 'Nenhum produto arquivado encontrado.'
                    : 'Nenhum produto encontrado com os filtros selecionados.'}
                </td>
              </tr>
            ) : (
              produtosFiltrados.map((produto) => {
                let quantidade = Number(produto.quantidade || 0)
                let tamanhosTexto = '-'

                if (Array.isArray(produto?.tamanhos) && produto.tamanhos.length > 0) {
                  quantidade = produto.tamanhos.reduce((total, item) => total + Number(item.quantidade || 0), 0)
                  tamanhosTexto = produto.tamanhos
                    .filter((item) => Number(item.quantidade || 0) > 0)
                    .map((item) => `${item.tamanho} (${item.quantidade})`)
                    .join(', ') || 'Sem grade ativa'
                } else if (produto.tamanho) {
                  tamanhosTexto = produto.tamanho
                }

                const custo = Number(produto.custo || 0)
                const venda = Number(produto.venda || 0)
                const lucro = venda - custo
                const arquivado = produto.ativo === false

                const fotoPrincipal =
                  produto.foto ||
                  (Array.isArray(produto.fotos) && produto.fotos.length > 0 ? produto.fotos[0].foto : null) ||
                  produto.imagem ||
                  produto.image ||
                  null

                return (
                  <tr key={produto.id} style={{ opacity: arquivado ? 0.75 : 1 }}>
                    <td className="produto-col-foto">
                      <div className="produto-foto-thumb">
                        {fotoPrincipal ? (
                          <img
                            src={fotoPrincipal}
                            alt={produto.nome}
                            loading="lazy"
                          />
                        ) : (
                          <span style={{ fontSize: '1.2rem', opacity: 0.6 }}>👗</span>
                        )}
                      </div>
                    </td>

                    <td className="produto-info-cell">
                      <strong>{produto?.nome || 'Produto sem nome'}</strong>
                      <small>
                        {produto?.marca ? `${produto.marca} ` : ''}
                        {produto?.sku ? `• SKU: ${produto.sku}` : ''}
                      </small>
                    </td>

                    <td>{produto?.categoria || '-'}</td>
                    <td>{tamanhosTexto}</td>

                    <td>
                      <span
                        className={
                          quantidade === 0
                            ? 'estoque-zero'
                            : quantidade <= 2
                              ? 'estoque-baixo'
                              : 'estoque-ok'
                        }
                      >
                        {quantidade} un.
                      </span>
                    </td>

                    <td>R$ {custo.toFixed(2)}</td>
                    <td>
                      <strong style={{ color: '#234b36' }}>
                        R$ {venda.toFixed(2)}
                      </strong>
                    </td>

                    <td>
                      <span
                        className={
                          arquivado
                            ? 'produto-inativo'
                            : 'produto-ativo'
                        }
                      >
                        {arquivado ? '📦 Arquivado' : '✓ Ativo'}
                      </span>
                    </td>

                    <td>
                      <strong style={{ color: lucro >= 0 ? '#2e6840' : '#991b1b' }}>
                        R$ {lucro.toFixed(2)}
                      </strong>
                    </td>

                    <td>
                      <div className="product-actions">
                        <button
                          type="button"
                          className={`action-toggle ${arquivado ? 'reativar' : ''}`}
                          onClick={() => alternarAtivo(produto)}
                          title={arquivado ? 'Reativar produto na loja e estoque' : 'Arquivar produto que não será mais vendido'}
                        >
                          {arquivado ? 'Reativar' : 'Arquivar'}
                        </button>

                        <button
                          type="button"
                          className="action-edit"
                          onClick={() => handleEditar(produto)}
                          title="Editar produto"
                        >
                          ✏️
                        </button>

                        {papelUsuario !== 'operador' && (
                          <button
                            type="button"
                            className="action-delete"
                            onClick={() => handleExcluir(produto.id)}
                            title="Excluir produto"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {mostrarFormulario && (
        <ProductForm
          onClose={() => {
            setMostrarFormulario(false)
            setProdutoEditando(null)
          }}
          onAddProduct={handleAdicionarProduto}
          onUpdateProduct={handleAtualizarProduto}
          produtoEditando={produtoEditando}
        />
      )}
    </div>
  )
}

export default Produtos
