import { useEffect, useMemo, useState } from 'react'
import './Estoque.css'

import {
  carregarProdutos,
  carregarMovimentacoes,
  carregarRemessas,
  alterarAtivoProduto
} from '../storage'
import { calcularSaldoConsignadoItem } from './revendasHelpers.js'
import {
  normalizarProduto,
  extrairGradeProduto,
  obterConsignadoTotalProduto,
  filtrarEOrdenarProdutos
} from './estoqueHelpers.js'

import EntradaEstoque from '../components/EntradaEstoque'
import SaidaEstoque from '../components/SaidaEstoque'

function normalizarMovimentacao(movimentacao) {
  if (!movimentacao || typeof movimentacao !== 'object') {
    return null
  }

  return {
    ...movimentacao,
    id: movimentacao.id ?? Date.now(),
    produtoId: movimentacao.produtoId ?? movimentacao.produto_id ?? null,
    produtoNome: movimentacao.produtoNome ?? movimentacao.produto_nome ?? '',
    tipo: movimentacao.tipo ?? '',
    quantidade: Number(movimentacao.quantidade ?? 0),
    estoqueAnterior: Number(movimentacao.estoqueAnterior ?? movimentacao.estoque_anterior ?? 0),
    estoqueAtual: Number(movimentacao.estoqueAtual ?? movimentacao.estoque_atual ?? 0),
    observacao: movimentacao.observacao ?? '',
    data: movimentacao.data ?? movimentacao.created_at ?? null
  }
}

function Estoque() {
  const [produtos, setProdutos] = useState([])
  const [movimentacoes, setMovimentacoes] = useState([])
  const [remessas, setRemessas] = useState([])
  const [carregando, setCarregando] = useState(true)

  // Modo de visualização: VISUAL é o padrão
  const [modoVisualizacao, setModoVisualizacao] = useState('visual')

  // Modais de entrada / saída
  const [mostrarEntrada, setMostrarEntrada] = useState(false)
  const [mostrarSaida, setMostrarSaida] = useState(false)
  const [produtoModalId, setProdutoModalId] = useState('')

  // Filtros
  const [visibilidadeFiltro, setVisibilidadeFiltro] = useState('Ativos')
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas as categorias')
  const [tamanhoFiltro, setTamanhoFiltro] = useState('Todos os tamanhos')
  const [statusFiltro, setStatusFiltro] = useState('Todos os status')
  const [ordenacao, setOrdenacao] = useState('nome_asc')

  // =====================================================
  // CARREGAR DADOS
  // =====================================================

  useEffect(() => {
    let ativo = true

    async function carregarDados() {
      try {
        setCarregando(true)

        const [produtosCarregados, movimentacoesCarregadas, remessasCarregadas] =
          await Promise.all([
            carregarProdutos(true),
            carregarMovimentacoes(),
            carregarRemessas()
          ])

        if (!ativo) return

        const produtosNormalizados = Array.isArray(produtosCarregados)
          ? produtosCarregados.map(normalizarProduto).filter(Boolean)
          : []

        const movimentacoesNormalizadas = Array.isArray(movimentacoesCarregadas)
          ? movimentacoesCarregadas.map(normalizarMovimentacao).filter(Boolean)
          : []

        setProdutos(produtosNormalizados)
        setMovimentacoes(movimentacoesNormalizadas)
        setRemessas(Array.isArray(remessasCarregadas) ? remessasCarregadas : [])
      } catch (erro) {
        console.error('Erro ao carregar estoque:', erro)
        if (ativo) {
          setProdutos([])
          setMovimentacoes([])
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
  // ATUALIZAR DADOS APÓS MOVIMENTAÇÃO / ARQUIVAMENTO
  // =====================================================

  async function atualizarDados() {
    try {
      const [produtosAtualizados, movimentacoesAtualizadas, remessasAtualizadas] =
        await Promise.all([
          carregarProdutos(true),
          carregarMovimentacoes(),
          carregarRemessas()
        ])

      const produtosNormalizados = Array.isArray(produtosAtualizados)
        ? produtosAtualizados.map(normalizarProduto).filter(Boolean)
        : []

      const movimentacoesNormalizadas = Array.isArray(movimentacoesAtualizadas)
        ? movimentacoesAtualizadas.map(normalizarMovimentacao).filter(Boolean)
        : []

      setProdutos(produtosNormalizados)
      setMovimentacoes(movimentacoesNormalizadas)
      setRemessas(Array.isArray(remessasAtualizadas) ? remessasAtualizadas : [])
    } catch (erro) {
      console.error('Erro ao atualizar estoque:', erro)
    }
  }

  // =====================================================
  // AÇÃO DE ARQUIVAR / REATIVAR PRODUTO
  // =====================================================

  async function handleAlternarAtivo(produto) {
    try {
      const estaAtivo = produto.ativo !== false

      if (estaAtivo) {
        const saldoConsig = obterConsignadoTotalProduto(produto.id, remessas)
        if (saldoConsig > 0) {
          window.alert(
            `Atenção: Não é possível arquivar silenciosamente.\n\nEste produto possui ${saldoConsig} peça(s) em consignação ativa com revendedoras.\nRecolha ou encerre as remessas consignadas antes de arquivar o produto.`
          )
          return
        }

        const confirmou = window.confirm(
          `Deseja arquivar o produto "${produto.nome}"?\n\nEle será ocultado da loja pública e da visualização padrão de Estoque, mantendo todo o histórico de vendas e movimentações intacto.`
        )
        if (!confirmou) return

        await alterarAtivoProduto(produto.id, false)
        await atualizarDados()
      } else {
        const confirmou = window.confirm(
          `Deseja reativar o produto "${produto.nome}"?\n\nEle voltará a aparecer na visualização padrão de Estoque e na Loja.`
        )
        if (!confirmou) return

        await alterarAtivoProduto(produto.id, true)
        await atualizarDados()
      }
    } catch (erro) {
      console.error('Erro ao alterar status de arquivamento:', erro)
      window.alert('Não foi possível alterar o status do produto.')
    }
  }

  // =====================================================
  // MÉTRICAS GERAIS (CARDS DO TOPO)
  // =====================================================

  const metricas = useMemo(() => {
    let totalPecasLoja = 0
    let estoqueBaixo = 0
    let semEstoque = 0

    const produtosBase = visibilidadeFiltro === 'Arquivados'
      ? produtos.filter((p) => p.ativo === false)
      : (visibilidadeFiltro === 'Todos' ? produtos : produtos.filter((p) => p.ativo !== false))

    for (const p of produtosBase) {
      let qtdProd = 0
      if (Array.isArray(p.tamanhos) && p.tamanhos.length > 0) {
        qtdProd = p.tamanhos.reduce((acc, t) => acc + Number(t.quantidade || 0), 0)
      } else {
        qtdProd = Number(p.quantidade || 0)
      }

      totalPecasLoja += qtdProd

      if (qtdProd === 0) {
        semEstoque += 1
      } else if (qtdProd <= 2) {
        estoqueBaixo += 1
      }
    }

    let totalPecasConsignadas = 0
    for (const rem of remessas) {
      const itens = Array.isArray(rem.itens) ? rem.itens : []
      for (const item of itens) {
        totalPecasConsignadas += calcularSaldoConsignadoItem(item)
      }
    }

    const patrimonioTotalEmpresa = totalPecasLoja + totalPecasConsignadas

    return {
      totalPecasLoja,
      totalPecasConsignadas,
      patrimonioTotalEmpresa,
      estoqueBaixo,
      semEstoque
    }
  }, [produtos, remessas, visibilidadeFiltro])

  // Lista de categorias dinâmicas
  const categoriasOpcoes = useMemo(() => {
    const setCat = new Set()
    produtos.forEach((p) => {
      if (p.categoria && String(p.categoria).trim()) {
        setCat.add(String(p.categoria).trim())
      }
    })
    return ['Todas as categorias', ...Array.from(setCat).sort()]
  }, [produtos])

  // Lista de tamanhos para filtro
  const tamanhosOpcoes = [
    'Todos os tamanhos',
    'PP',
    'P',
    'M',
    'G',
    'GG',
    '36',
    '38',
    '40',
    '42',
    '44',
    '46'
  ]

  // =====================================================
  // FILTRAGEM E ORDENAÇÃO
  // =====================================================

  const produtosProcessados = useMemo(() => {
    return filtrarEOrdenarProdutos(produtos, remessas, {
      busca,
      visibilidadeFiltro,
      categoriaFiltro,
      tamanhoFiltro,
      statusFiltro,
      ordenacao
    })
  }, [produtos, remessas, busca, visibilidadeFiltro, categoriaFiltro, tamanhoFiltro, statusFiltro, ordenacao])

  // =====================================================
  // AÇÕES DE MODAL
  // =====================================================

  function abrirEntrada(produtoId = '') {
    setProdutoModalId(produtoId)
    setMostrarEntrada(true)
  }

  function abrirSaida(produtoId = '') {
    setProdutoModalId(produtoId)
    setMostrarSaida(true)
  }

  function formatarData(dataIso) {
    if (!dataIso) return '-'
    const d = new Date(dataIso)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="estoque-page">
      {/* CABEÇALHO */}
      <div className="produtos-header">
        <div>
          <h1>Estoque</h1>
          <p>
            Controle visual completo de peças na loja, grade de tamanhos e mercadorias consignadas
          </p>
        </div>

        <div className="estoque-topo-acoes">
          {/* ALTERNADOR VISUAL / TABELA */}
          <div className="estoque-visual-switcher">
            <button
              type="button"
              className={modoVisualizacao === 'visual' ? 'ativo' : ''}
              onClick={() => setModoVisualizacao('visual')}
              title="Visualização em cards com fotos grandes e grade"
            >
              🖼️ Visual
            </button>
            <button
              type="button"
              className={modoVisualizacao === 'tabela' ? 'ativo' : ''}
              onClick={() => setModoVisualizacao('tabela')}
              title="Visualização em tabela analítica completa"
            >
              📋 Tabela
            </button>
          </div>

          <button
            type="button"
            className="novo-produto"
            onClick={() => abrirSaida()}
            style={{ background: '#b91c1c' }}
          >
            − Registrar Saída
          </button>

          <button
            type="button"
            className="novo-produto"
            onClick={() => abrirEntrada()}
          >
            + Registrar Entrada
          </button>
        </div>
      </div>

      {/* CARDS DE RESUMO DO ESTOQUE */}
      <div className="estoque-cards">
        <div className="card">
          <div className="card-icon">🏛️</div>
          <div>
            <span>Patrimônio Total</span>
            <h2>{metricas.patrimonioTotalEmpresa} un.</h2>
            <small>Loja + Consignação</small>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">🏬</div>
          <div>
            <span>Disponível na Loja</span>
            <h2>{metricas.totalPecasLoja} un.</h2>
            <small>Para venda online/balcão</small>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">🤝</div>
          <div>
            <span>Em Consignação</span>
            <h2>{metricas.totalPecasConsignadas} un.</h2>
            <small>Com revendedoras</small>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">🟠</div>
          <div>
            <span>Atenção / Zerado</span>
            <h2>{metricas.estoqueBaixo + metricas.semEstoque}</h2>
            <small>{metricas.semEstoque} sem estoque</small>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS E BUSCA */}
      <div className="estoque-filtros-bar">
        <div className="estoque-busca-wrapper">
          <span className="estoque-busca-icon">🔎</span>
          <input
            type="text"
            placeholder="Buscar por nome do produto ou SKU..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {/* FILTRO VISIBILIDADE: ATIVOS (PADRÃO) | ARQUIVADOS | TODOS */}
        <select
          className="estoque-select-filtro"
          value={visibilidadeFiltro}
          onChange={(e) => setVisibilidadeFiltro(e.target.value)}
          title="Filtrar por produtos ativos ou arquivados"
        >
          <option value="Ativos">Ativos (Padrão)</option>
          <option value="Arquivados">Arquivados</option>
          <option value="Todos">Todos os produtos</option>
        </select>

        <select
          className="estoque-select-filtro"
          value={categoriaFiltro}
          onChange={(e) => setCategoriaFiltro(e.target.value)}
        >
          {categoriasOpcoes.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          className="estoque-select-filtro"
          value={tamanhoFiltro}
          onChange={(e) => setTamanhoFiltro(e.target.value)}
        >
          {tamanhosOpcoes.map((tam) => (
            <option key={tam} value={tam}>
              {tam === 'Todos os tamanhos' ? 'Todos os tamanhos' : `Tamanho ${tam}`}
            </option>
          ))}
        </select>

        <select
          className="estoque-select-filtro"
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value)}
        >
          <option value="Todos os status">Todos os status</option>
          <option value="Estoque normal">Estoque normal</option>
          <option value="Estoque baixo">Estoque baixo (1-2 un.)</option>
          <option value="Sem estoque">Sem estoque (0 un.)</option>
          <option value="Com consignação">Em consignação</option>
        </select>

        <select
          className="estoque-select-filtro"
          value={ordenacao}
          onChange={(e) => setOrdenacao(e.target.value)}
          title="Ordenar produtos"
        >
          <option value="nome_asc">Nome (A - Z)</option>
          <option value="nome_desc">Nome (Z - A)</option>
          <option value="estoque_asc">Menor Estoque (Críticos primeiro)</option>
          <option value="estoque_desc">Maior Estoque</option>
          <option value="consignado_desc">Mais Consignados</option>
          <option value="preco_desc">Maior Preço</option>
          <option value="preco_asc">Menor Preço</option>
        </select>
      </div>

      {/* CONTEÚDO PRINCIPAL: VISUAL VS TABELA */}
      {carregando ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
          <div style={{ fontSize: '2rem', marginBottom: '10px' }}>⏳</div>
          <strong>Carregando estoque completo...</strong>
        </div>
      ) : produtosProcessados.length === 0 ? (
        <div className="estoque-busca-vazia">
          <div className="estoque-busca-vazia-icon">👗</div>
          <h3>Nenhum produto encontrado</h3>
          <p>
            {visibilidadeFiltro === 'Arquivados'
              ? 'Nenhum produto arquivado encontrado.'
              : 'Tente ajustar os filtros de busca, categoria ou visibilidade.'}
          </p>
          {(busca ||
            categoriaFiltro !== 'Todas as categorias' ||
            tamanhoFiltro !== 'Todos os tamanhos' ||
            statusFiltro !== 'Todos os status' ||
            visibilidadeFiltro !== 'Ativos') && (
            <button
              type="button"
              className="estoque-btn-limpar-filtros"
              onClick={() => {
                setBusca('')
                setVisibilidadeFiltro('Ativos')
                setCategoriaFiltro('Todas as categorias')
                setTamanhoFiltro('Todos os tamanhos')
                setStatusFiltro('Todos os status')
              }}
            >
              Limpar todos os filtros
            </button>
          )}
        </div>
      ) : modoVisualizacao === 'visual' ? (
        /* MODO VISUAL: CARDS COM FOTO PROTAGONISTA E GRADE */
        <div className="estoque-visual-grid">
          {produtosProcessados.map((produto) => {
            const qtdLoja = Array.isArray(produto.tamanhos) && produto.tamanhos.length > 0
              ? produto.tamanhos.reduce((acc, t) => acc + Number(t.quantidade || 0), 0)
              : Number(produto.quantidade || 0)

            const qtdConsig = obterConsignadoTotalProduto(produto.id, remessas)
            const totalEmpresa = qtdLoja + qtdConsig
            const gradeTamanhos = extrairGradeProduto(produto, remessas)
            const arquivado = produto.ativo === false

            return (
              <div
                key={produto.id}
                className="estoque-card-produto"
                style={{ opacity: arquivado ? 0.78 : 1 }}
              >
                {/* FOTO PRINCIPAL LIMPA (SOMENTE A ROUPA/PRODUTO) */}
                <div className="estoque-card-foto-wrapper">
                  {produto.foto ? (
                    <img
                      src={produto.foto}
                      alt={produto.nome}
                      className="estoque-card-foto"
                      loading="lazy"
                    />
                  ) : (
                    <div className="estoque-card-sem-foto">
                      <span className="estoque-card-sem-foto-icon">👗</span>
                      <span>Sem foto cadastrada</span>
                    </div>
                  )}
                </div>

                {/* CORPO DO CARD */}
                <div className="estoque-card-conteudo">
                  <div className="estoque-card-cabecalho">
                    <h3 className="estoque-card-nome" title={produto.nome}>
                      {produto.nome}
                    </h3>
                    <div className="estoque-card-subinfo">
                      <span className="estoque-card-sku">
                        {produto.sku ? `#${produto.sku}` : 'Sem SKU'}
                      </span>
                      <span className="estoque-card-preco">
                        {'R$ ' + Number(produto.venda || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* GRADE DE TAMANHOS (PP, P, M, G, GG) */}
                  <div className="estoque-card-grade-section">
                    <div className="estoque-card-grade-label">
                      <span>Grade de Tamanhos</span>
                      <span>Qtd. Disponível</span>
                    </div>
                    <div className="estoque-card-grade-grid">
                      {gradeTamanhos.map((tamObj) => {
                        let classeTam = 'disponivel'
                        if (tamObj.qtdLoja === 0) {
                          classeTam = 'esgotado'
                        } else if (tamObj.qtdLoja <= 2) {
                          classeTam = 'baixo'
                        }

                        return (
                          <div
                            key={tamObj.tamanho}
                            className={`grade-tamanho-box ${classeTam}`}
                            title={`Tamanho ${tamObj.tamanho}: ${tamObj.qtdLoja} disponíveis na loja`}
                          >
                            <span className="tam-letra">{tamObj.tamanho}</span>
                            <span className="tam-qtd">{tamObj.qtdLoja}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* CONSOLIDAÇÃO DE ESTOQUE */}
                  <div className="estoque-card-metricas-box">
                    <div className="estoque-card-metrica-item loja">
                      <span className="metrica-label">Na Loja</span>
                      <span className="metrica-valor">{qtdLoja} un.</span>
                    </div>
                    <div className="estoque-card-metrica-item consignado">
                      <span className="metrica-label">Consignado</span>
                      <span className="metrica-valor">{qtdConsig} un.</span>
                    </div>
                    <div className="estoque-card-metrica-item total">
                      <span className="metrica-label">Total Empresa</span>
                      <span className="metrica-valor">{totalEmpresa} un.</span>
                    </div>
                  </div>

                  {/* AÇÕES RÁPIDAS NO CARD */}
                  <div className="estoque-card-acoes">
                    <button
                      type="button"
                      className="estoque-btn-card-acao saida"
                      onClick={() => abrirSaida(produto.id)}
                      title="Registrar saída deste produto"
                    >
                      − Saída
                    </button>
                    <button
                      type="button"
                      className="estoque-btn-card-acao entrada"
                      onClick={() => abrirEntrada(produto.id)}
                      title="Registrar entrada deste produto"
                    >
                      + Entrada
                    </button>
                    <button
                      type="button"
                      className={`estoque-btn-card-acao ${arquivado ? 'reativar' : 'arquivar'}`}
                      onClick={() => handleAlternarAtivo(produto)}
                      title={arquivado ? 'Reativar produto no estoque' : 'Arquivar produto que não será mais reposto'}
                    >
                      {arquivado ? 'Reativar' : 'Arquivar'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* MODO TABELA PRESERVADA */
        <div className="produtos-tabela">
          <table>
            <thead>
              <tr>
                <th>Foto</th>
                <th>Produto</th>
                <th>SKU</th>
                <th>Grade / Tamanhos</th>
                <th>Disp. Loja</th>
                <th>Consignado</th>
                <th>Total Empresa</th>
                <th>Status</th>
                <th>Preço</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {produtosProcessados.map((produto) => {
                const qtdLoja = Array.isArray(produto.tamanhos) && produto.tamanhos.length > 0
                  ? produto.tamanhos.reduce((acc, t) => acc + Number(t.quantidade || 0), 0)
                  : Number(produto.quantidade || 0)

                const qtdConsig = obterConsignadoTotalProduto(produto.id, remessas)
                const totalEmpresa = qtdLoja + qtdConsig
                const grade = extrairGradeProduto(produto, remessas)
                const arquivado = produto.ativo === false

                let status = 'Normal'
                let classe = 'paid'
                if (arquivado) {
                  status = 'Arquivado'
                  classe = 'pending'
                } else if (qtdLoja === 0) {
                  status = 'Sem estoque loja'
                  classe = 'out-stock'
                } else if (qtdLoja <= 2) {
                  status = 'Estoque baixo'
                  classe = 'pending'
                }

                return (
                  <tr key={produto.id} style={{ opacity: arquivado ? 0.75 : 1 }}>
                    <td>
                      <div className="estoque-tabela-foto-col">
                        {produto.foto ? (
                          <img
                            src={produto.foto}
                            alt={produto.nome}
                            className="estoque-tabela-foto-img"
                            loading="lazy"
                          />
                        ) : (
                          <span style={{ fontSize: '1.2rem', opacity: 0.5 }}>👗</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="estoque-tabela-produto-info">
                        <strong>{produto.nome}</strong>
                        <small>{produto.categoria || 'Sem categoria'}</small>
                      </div>
                    </td>
                    <td>
                      <code>{produto.sku || '-'}</code>
                    </td>
                    <td>
                      <div className="estoque-tabela-grade-chips">
                        {grade.map((g) => (
                          <span
                            key={g.tamanho}
                            className={`estoque-tabela-chip-tam ${
                              g.qtdLoja === 0 ? 'esgotado' : g.qtdLoja <= 2 ? 'baixo' : ''
                            }`}
                            title={`${g.tamanho}: ${g.qtdLoja} na loja`}
                          >
                            {g.tamanho}: {g.qtdLoja}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: qtdLoja === 0 ? '#b91c1c' : '#15803d' }}>
                        {qtdLoja} un.
                      </strong>
                    </td>
                    <td>
                      <span>{qtdConsig} un.</span>
                    </td>
                    <td>
                      <strong>{totalEmpresa} un.</strong>
                    </td>
                    <td>
                      <span className={`status-badge ${classe}`}>{status}</span>
                    </td>
                    <td>R$ {Number(produto.venda || 0).toFixed(2)}</td>
                    <td>
                      <div className="product-actions">
                        <button
                          type="button"
                          className="action-edit"
                          onClick={() => abrirEntrada(produto.id)}
                          title="Entrada de estoque"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="action-delete"
                          onClick={() => abrirSaida(produto.id)}
                          title="Saída de estoque"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          className={`action-toggle ${arquivado ? 'reativar' : ''}`}
                          onClick={() => handleAlternarAtivo(produto)}
                          title={arquivado ? 'Reativar produto' : 'Arquivar produto'}
                        >
                          {arquivado ? 'Reativar' : 'Arquivar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* SEÇÃO DE HISTÓRICO DE MOVIMENTAÇÕES */}
      <div className="estoque-historico-section" style={{ marginTop: '40px' }}>
        <div className="estoque-historico-header">
          <div>
            <h2>Histórico de Movimentações</h2>
            <p>Registro auditado de todas as entradas, saídas e ajustes manuais</p>
          </div>
          <span className="badge-total-mov">{movimentacoes.length} registros</span>
        </div>

        {movimentacoes.length === 0 ? (
          <div className="estoque-busca-vazia">
            <p>Nenhuma movimentação registrada até o momento.</p>
          </div>
        ) : (
          <div className="produtos-tabela">
            <table>
              <thead>
                <tr>
                  <th>Data e Hora</th>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Estoque anterior</th>
                  <th>Estoque atual</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {[...movimentacoes].reverse().map((movimentacao) => (
                  <tr key={movimentacao.id}>
                    <td>{formatarData(movimentacao.data)}</td>
                    <td>
                      <strong>{movimentacao.produtoNome || 'Produto'}</strong>
                    </td>
                    <td>
                      <span
                        className={
                          movimentacao.tipo === 'entrada'
                            ? 'movimento-entrada'
                            : 'movimento-saida'
                        }
                      >
                        {movimentacao.tipo === 'entrada' ? '↑ Entrada' : '↓ Saída'}
                      </span>
                    </td>
                    <td>
                      <strong
                        className={
                          movimentacao.tipo === 'entrada'
                            ? 'quantidade-entrada'
                            : 'quantidade-saida'
                        }
                      >
                        {movimentacao.tipo === 'entrada' ? '+' : '-'}
                        {movimentacao.quantidade}
                      </strong>
                    </td>
                    <td>{movimentacao.estoqueAnterior}</td>
                    <td>
                      <strong>{movimentacao.estoqueAtual}</strong>
                    </td>
                    <td>{movimentacao.observacao || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE ENTRADA */}
      {mostrarEntrada && (
        <EntradaEstoque
          produtos={produtos}
          produtoInicialId={produtoModalId}
          onClose={() => {
            setMostrarEntrada(false)
            setProdutoModalId('')
          }}
          onSuccess={async (novosProdutos) => {
            if (Array.isArray(novosProdutos)) {
              setProdutos(novosProdutos.map(normalizarProduto).filter(Boolean))
            }
            await atualizarDados()
            setMostrarEntrada(false)
            setProdutoModalId('')
          }}
        />
      )}

      {/* MODAL DE SAÍDA */}
      {mostrarSaida && (
        <SaidaEstoque
          produtos={produtos}
          produtoInicialId={produtoModalId}
          onClose={() => {
            setMostrarSaida(false)
            setProdutoModalId('')
          }}
          onSuccess={async (novosProdutos) => {
            if (Array.isArray(novosProdutos)) {
              setProdutos(novosProdutos.map(normalizarProduto).filter(Boolean))
            }
            await atualizarDados()
            setMostrarSaida(false)
            setProdutoModalId('')
          }}
        />
      )}
    </div>
  )
}

export default Estoque