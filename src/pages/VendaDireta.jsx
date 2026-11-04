import { useState, useEffect, useMemo } from 'react'
import {
  carregarProdutos,
  criarVendaDireta,
  salvarRascunhoVendaDireta,
  carregarRascunhosVendaDireta,
  excluirRascunhoVendaDireta,
  carregarConfiguracaoPix,
  gerarLinkPagamentoMercadoPago
} from '../storage'
import {
  formatarPreco,
  normalizarTelefone,
  normalizarCep,
  formatarCep,
  calcularPrecoComDesconto,
  calcularTotaisVendaDireta,
  montarResumoWhatsApp,
  montarMensagemFinalWhatsApp,
  filtrarOpcoesFreteVendaDireta
} from './vendaDiretaHelpers'
import { supabase } from '../lib/supabase'
import './VendaDireta.css'

export default function VendaDireta({ usuarioLogado, setPagina }) {
  // Dados Mestres
  const [produtos, setProdutos] = useState([])
  const [configPix, setConfigPix] = useState({ chavePix: '', beneficiario: '', cidade: '' })

  // Rascunhos
  const [rascunhos, setRascunhos] = useState([])
  const [mostrarRascunhosModal, setMostrarRascunhosModal] = useState(false)
  const [rascunhoAtualId, setRascunhoAtualId] = useState(null)

  // Itens da Venda Atual
  const [itensVenda, setItensVenda] = useState([])
  const [indiceItemEditando, setIndiceItemEditando] = useState(null)

  // Formulário de Seleção do Produto
  const [buscaProduto, setBuscaProduto] = useState('')
  const [produtoSelecionado, setProdutoSelecionado] = useState(null)
  const [variacaoSelecionada, setVariacaoSelecionada] = useState(null)
  const [tamanhoSelecionado, setTamanhoSelecionado] = useState('')
  const [quantidadeItem, setQuantidadeItem] = useState(1)
  const [precoPraticadoItem, setPrecoPraticadoItem] = useState(0)
  const [descontoPercentualItem, setDescontoPercentualItem] = useState(0)

  // Dados da Cliente
  const [nomeCliente, setNomeCliente] = useState('')
  const [telefoneCliente, setTelefoneCliente] = useState('')
  const [emailCliente, setEmailCliente] = useState('')
  const [observacaoInterna, setObservacaoInterna] = useState('')

  // Modalidade de Entrega
  const [modalidadeEntrega, setModalidadeEntrega] = useState('correios') // correios, motoboy_loja, motoboy_cliente, retirada
  const [valorMotoboyLoja, setValorMotoboyLoja] = useState('')
  const [dadosEndereco, setDadosEndereco] = useState({
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: ''
  })
  const [opcoesFreteMelhorEnvio, setOpcoesFreteMelhorEnvio] = useState([])
  const [freteMelhorEnvioSelecionado, setFreteMelhorEnvioSelecionado] = useState(null)
  const [calculandoFrete, setCalculandoFrete] = useState(false)
  const [mensagemFrete, setMensagemFrete] = useState('')

  // Forma de Pagamento
  const [formaPagamento, setFormaPagamento] = useState('Pix') // Pix, Cartão de crédito
  const [linkMercadoPagoGerado, setLinkMercadoPagoGerado] = useState('')
  const [gerandoLinkMP, setGerandoLinkMP] = useState(false)

  // Estados de Ação
  const [processandoVenda, setProcessandoVenda] = useState(false)
  const [pedidoFinalizado, setPedidoFinalizado] = useState(null)
  const [feedbackCopia, setFeedbackCopia] = useState('')

  // Carregar produtos e configurações iniciais
  useEffect(() => {
    let ativo = true
    async function inicializar() {
      try {
        const [prods, pix] = await Promise.all([
          carregarProdutos(),
          carregarConfiguracaoPix()
        ])
        if (!ativo) return
        setProdutos(prods || [])
        setConfigPix(pix || {})
      } catch (err) {
        console.error('Erro ao inicializar Venda Direta:', err)
      }
    }
    inicializar()
    return () => { ativo = false }
  }, [])

  // Carregar rascunhos salvos
  const carregarRascunhos = async () => {
    const list = await carregarRascunhosVendaDireta()
    setRascunhos(list)
  }

  useEffect(() => {
    carregarRascunhos()
  }, [])

  // Produtos filtrados para o autocomplete
  const produtosFiltrados = useMemo(() => {
    const termo = buscaProduto.trim().toLowerCase()
    if (!termo) return []
    return produtos.filter((p) => {
      const nome = (p.nome || '').toLowerCase()
      const sku = (p.sku || '').toLowerCase()
      const marca = (p.marca || '').toLowerCase()
      return nome.includes(termo) || sku.includes(termo) || marca.includes(termo)
    }).slice(0, 15)
  }, [produtos, buscaProduto])

  // Tratar seleção de produto
  const handleSelecionarProduto = (prod) => {
    setProdutoSelecionado(prod)
    setBuscaProduto(`${prod.nome} ${prod.sku ? `(SKU: ${prod.sku})` : ''}`)
    setPrecoPraticadoItem(Number(prod.venda || 0))
    setDescontoPercentualItem(0)
    setQuantidadeItem(1)

    // Se tiver variações de cor
    if (Array.isArray(prod.variacoes) && prod.variacoes.length > 0) {
      setVariacaoSelecionada(prod.variacoes[0])
      // Seleciona o primeiro tamanho com estoque daquela variação
      const tam = prod.variacoes[0].tamanhos?.find((t) => t.quantidade > 0) || prod.variacoes[0].tamanhos?.[0]
      setTamanhoSelecionado(tam?.tamanho || '')
    } else {
      setVariacaoSelecionada(null)
      // Produto sem variações multicor
      const tam = prod.tamanhos?.find((t) => t.quantidade > 0) || prod.tamanhos?.[0]
      setTamanhoSelecionado(tam?.tamanho || '')
    }
  }

  // Obter cores disponíveis para o produto selecionado
  const coresDisponiveis = useMemo(() => {
    if (!produtoSelecionado) return []
    if (Array.isArray(produtoSelecionado.variacoes) && produtoSelecionado.variacoes.length > 0) {
      return produtoSelecionado.variacoes.map((v) => ({
        id: v.id,
        cor: v.cor_nome || v.cor || 'Única',
        cor_hex: v.cor_hex || '#b76e79',
        variacao: v
      }))
    }
    return [{
      id: null,
      cor: produtoSelecionado.cor || 'Única',
      cor_hex: produtoSelecionado.cor_hex || '#b76e79',
      variacao: null
    }]
  }, [produtoSelecionado])

  // Obter tamanhos e estoques da cor selecionada
  const tamanhosDisponiveis = useMemo(() => {
    if (!produtoSelecionado) return []
    if (variacaoSelecionada && Array.isArray(variacaoSelecionada.tamanhos)) {
      return variacaoSelecionada.tamanhos
    }
    if (Array.isArray(produtoSelecionado.tamanhos) && produtoSelecionado.tamanhos.length > 0) {
      return produtoSelecionado.tamanhos
    }
    return [{
      id: null,
      tamanho: 'Único',
      quantidade: produtoSelecionado.quantidade || 0
    }]
  }, [produtoSelecionado, variacaoSelecionada])

  // Estoque atual do tamanho selecionado
  const estoqueDisponivel = useMemo(() => {
    if (!tamanhoSelecionado) return 0
    const reg = tamanhosDisponiveis.find((t) => t.tamanho === tamanhoSelecionado)
    return reg ? reg.quantidade : (produtoSelecionado?.quantidade || 0)
  }, [tamanhosDisponiveis, tamanhoSelecionado, produtoSelecionado])

  // Custo unitário automático do produto
  const custoUnitario = useMemo(() => {
    return Number(produtoSelecionado?.custo || 0)
  }, [produtoSelecionado])

  // Totais do item que está sendo editado/adicionado no topo
  const calculoItemAtual = useMemo(() => {
    return calcularPrecoComDesconto(precoPraticadoItem, descontoPercentualItem)
  }, [precoPraticadoItem, descontoPercentualItem])

  // Adicionar ou Salvar Edição do Item na Venda
  const handleAdicionarItem = (e) => {
    e.preventDefault()
    if (!produtoSelecionado) {
      alert('Selecione um produto cadastrado.')
      return
    }

    if (quantidadeItem <= 0) {
      alert('Informe uma quantidade válida maior que 0.')
      return
    }

    if (quantidadeItem > estoqueDisponivel) {
      alert(`Quantidade informada (${quantidadeItem}) excede o estoque disponível (${estoqueDisponivel}).`)
      return
    }

    const itemObj = {
      produtoId: produtoSelecionado.id,
      produto_id: produtoSelecionado.id,
      variacaoId: variacaoSelecionada?.id || null,
      variacao_id: variacaoSelecionada?.id || null,
      nome: produtoSelecionado.nome,
      sku: produtoSelecionado.sku || '',
      marca: produtoSelecionado.marca || 'Bazar Encanto',
      cor: variacaoSelecionada?.cor_nome || variacaoSelecionada?.cor || produtoSelecionado.cor || 'Única',
      cor_hex: variacaoSelecionada?.cor_hex || produtoSelecionado.cor_hex || '#b76e79',
      tamanho: tamanhoSelecionado || 'Único',
      custo: custoUnitario,
      precoOriginal: Number(produtoSelecionado.venda || 0),
      precoPraticado: Number(precoPraticadoItem),
      descontoPercentual: Number(descontoPercentualItem || 0),
      descontoValor: calculoItemAtual.descontoUnitario,
      precoLiquido: calculoItemAtual.precoLiquido,
      quantidade: Number(quantidadeItem),
      subtotal: Math.round(calculoItemAtual.precoLiquido * Number(quantidadeItem) * 100) / 100
    }

    if (indiceItemEditando !== null) {
      const novosItens = [...itensVenda]
      novosItens[indiceItemEditando] = itemObj
      setItensVenda(novosItens)
      setIndiceItemEditando(null)
    } else {
      setItensVenda([...itensVenda, itemObj])
    }

    // Limpar formulário de item
    setProdutoSelecionado(null)
    setVariacaoSelecionada(null)
    setTamanhoSelecionado('')
    setBuscaProduto('')
    setQuantidadeItem(1)
    setPrecoPraticadoItem(0)
    setDescontoPercentualItem(0)
  }

  // Editar Item da Lista
  const handleEditarItem = (index) => {
    const it = itensVenda[index]
    const prod = produtos.find((p) => p.id === it.produtoId)
    if (prod) {
      setProdutoSelecionado(prod)
      setBuscaProduto(`${prod.nome} ${prod.sku ? `(SKU: ${prod.sku})` : ''}`)
      if (it.variacaoId && Array.isArray(prod.variacoes)) {
        const varEnc = prod.variacoes.find((v) => v.id === it.variacaoId)
        setVariacaoSelecionada(varEnc || null)
      } else {
        setVariacaoSelecionada(null)
      }
      setTamanhoSelecionado(it.tamanho)
      setPrecoPraticadoItem(it.precoPraticado)
      setDescontoPercentualItem(it.descontoPercentual)
      setQuantidadeItem(it.quantidade)
      setIndiceItemEditando(index)
    }
  }

  // Remover Item da Lista
  const handleRemoverItem = (index) => {
    setItensVenda(itensVenda.filter((_, idx) => idx !== index))
    if (indiceItemEditando === index) {
      setIndiceItemEditando(null)
      setProdutoSelecionado(null)
      setBuscaProduto('')
    }
  }

  // Valor do Frete Atual
  const valorFreteAtual = useMemo(() => {
    if (modalidadeEntrega === 'motoboy_cliente' || modalidadeEntrega === 'retirada') {
      return 0
    }
    if (modalidadeEntrega === 'motoboy_loja') {
      return Number(valorMotoboyLoja.replace(',', '.')) || 0
    }
    if (modalidadeEntrega === 'correios') {
      return freteMelhorEnvioSelecionado?.preco || 0
    }
    return 0
  }, [modalidadeEntrega, valorMotoboyLoja, freteMelhorEnvioSelecionado])

  // Totais Gerais da Venda
  const totaisGerais = useMemo(() => {
    return calcularTotaisVendaDireta(itensVenda, valorFreteAtual)
  }, [itensVenda, valorFreteAtual])

  // Consulta de Frete Melhor Envio
  const handleCalcularFreteMelhorEnvio = async () => {
    const cepLimpo = normalizarCep(dadosEndereco.cep)
    if (cepLimpo.length !== 8) {
      setMensagemFrete('Informe um CEP válido de 8 dígitos.')
      return
    }

    if (itensVenda.length === 0) {
      setMensagemFrete('Adicione ao menos 1 produto para cotar o frete.')
      return
    }

    try {
      setCalculandoFrete(true)
      setMensagemFrete('')
      setOpcoesFreteMelhorEnvio([])
      setFreteMelhorEnvioSelecionado(null)

      // 1. Busca endereço no ViaCEP
      const respViaCep = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`).catch(() => null)
      if (respViaCep && respViaCep.ok) {
        const end = await respViaCep.json()
        if (!end.erro) {
          setDadosEndereco((prev) => ({
            ...prev,
            endereco: end.logradouro || prev.endereco,
            bairro: end.bairro || prev.bairro,
            cidade: end.localidade || prev.cidade,
            estado: end.uf ? end.uf.toUpperCase() : prev.estado
          }))
        }
      }

      // 2. Consulta frete via Edge Function
      const itensCotacao = itensVenda.map((it) => ({
        produto_id: it.produtoId,
        quantidade: it.quantidade
      }))

      const { data, error } = await supabase.functions.invoke('calcular-frete', {
        body: {
          cep: cepLimpo,
          cep_destino: cepLimpo,
          itens: itensCotacao
        }
      })

      if (error || !data?.sucesso || !Array.isArray(data?.opcoes)) {
        setOpcoesFreteMelhorEnvio([])
        setFreteMelhorEnvioSelecionado(null)
        setMensagemFrete(data?.mensagem || 'Não foi possível calcular o frete para este CEP.')
        return
      }

      const opcoesFiltradas = filtrarOpcoesFreteVendaDireta(data.opcoes)

      if (opcoesFiltradas.length === 0) {
        setOpcoesFreteMelhorEnvio([])
        setFreteMelhorEnvioSelecionado(null)
        setMensagemFrete('PAC e SEDEX não estão disponíveis para este CEP.')
        return
      }

      setMensagemFrete('')
      setOpcoesFreteMelhorEnvio(opcoesFiltradas)
      setFreteMelhorEnvioSelecionado(opcoesFiltradas[0])
    } catch (err) {
      console.error('Erro na cotação de frete:', err)
      setMensagemFrete('Erro ao calcular frete no Melhor Envio.')
    } finally {
      setCalculandoFrete(false)
    }
  }

  // Copiar para o clipboard com feedback
  const copiarTexto = async (texto, label = 'Copiado!') => {
    try {
      await navigator.clipboard.writeText(texto)
      setFeedbackCopia(label)
      setTimeout(() => setFeedbackCopia(''), 2500)
    } catch {
      setFeedbackCopia('Erro ao copiar')
      setTimeout(() => setFeedbackCopia(''), 2500)
    }
  }

  // Salvar Rascunho
  const handleSalvarRascunho = async () => {
    if (itensVenda.length === 0 && !nomeCliente) {
      alert('Adicione ao menos um cliente ou produto para salvar o rascunho.')
      return
    }

    const payload = {
      id: rascunhoAtualId,
      cliente: nomeCliente,
      telefone: telefoneCliente,
      email: emailCliente,
      itens: itensVenda,
      entrega: {
        modalidade: modalidadeEntrega,
        valorMotoboyLoja,
        endereco: dadosEndereco,
        freteSelecionado: freteMelhorEnvioSelecionado
      },
      formaPagamento,
      observacao: observacaoInterna
    }

    const res = await salvarRascunhoVendaDireta(payload)
    if (res.sucesso) {
      setRascunhoAtualId(res.rascunho.id)
      carregarRascunhos()
      copiarTexto('', '💾 Rascunho salvo com sucesso!')
    } else {
      alert(res.mensagem || 'Erro ao salvar rascunho.')
    }
  }

  // Carregar Rascunho Selecionado
  const handleAbrirRascunho = (rascunho) => {
    setRascunhoAtualId(rascunho.id)
    setNomeCliente(rascunho.cliente || '')
    setTelefoneCliente(rascunho.telefone || '')
    setEmailCliente(rascunho.email || '')
    setObservacaoInterna(rascunho.observacao || '')
    setItensVenda(Array.isArray(rascunho.itens) ? rascunho.itens : [])
    setFormaPagamento(rascunho.forma_pagamento || 'Pix')

    if (rascunho.entrega) {
      setModalidadeEntrega(rascunho.entrega.modalidade || 'correios')
      setValorMotoboyLoja(rascunho.entrega.valorMotoboyLoja || '')
      setDadosEndereco(rascunho.entrega.endereco || dadosEndereco)
      setFreteMelhorEnvioSelecionado(rascunho.entrega.freteSelecionado || null)
    }

    setMostrarRascunhosModal(false)
    copiarTexto('', '📂 Rascunho carregado.')
  }

  // Excluir Rascunho
  const handleExcluirRascunho = async (id, e) => {
    e.stopPropagation()
    if (confirm('Deseja excluir este rascunho?')) {
      await excluirRascunhoVendaDireta(id)
      if (rascunhoAtualId === id) setRascunhoAtualId(null)
      carregarRascunhos()
    }
  }

  // Limpar Venda / Novo Atendimento
  const handleNovoAtendimento = () => {
    setRascunhoAtualId(null)
    setItensVenda([])
    setIndiceItemEditando(null)
    setProdutoSelecionado(null)
    setVariacaoSelecionada(null)
    setTamanhoSelecionado('')
    setBuscaProduto('')
    setNomeCliente('')
    setTelefoneCliente('')
    setEmailCliente('')
    setObservacaoInterna('')
    setModalidadeEntrega('correios')
    setValorMotoboyLoja('')
    setDadosEndereco({ cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' })
    setOpcoesFreteMelhorEnvio([])
    setFreteMelhorEnvioSelecionado(null)
    setFormaPagamento('Pix')
    setLinkMercadoPagoGerado('')
    setPedidoFinalizado(null)
  }

  // Gerar Link Mercado Pago
  const handleGerarLinkMP = async () => {
    if (totaisGerais.totalFinal <= 0) {
      alert('O valor da venda precisa ser maior que R$ 0,00.')
      return
    }

    try {
      setGerandoLinkMP(true)
      const res = await gerarLinkPagamentoMercadoPago({
        pedidoId: rascunhoAtualId || 'temp-' + Date.now(),
        cliente: nomeCliente || 'Cliente WhatsApp',
        email: emailCliente || null,
        total: totaisGerais.totalFinal,
        itens: itensVenda.map((it) => ({
          nome: `${it.nome} (${it.cor} - ${it.tamanho})`,
          quantidade: it.quantidade,
          preco: it.precoLiquido
        }))
      })

      if (res.sucesso && res.link) {
        setLinkMercadoPagoGerado(res.link)
      } else {
        alert(res.mensagem || 'Não foi possível gerar o link do Mercado Pago.')
      }
    } catch (err) {
      console.error('Erro ao gerar link MP:', err)
      alert('Erro ao conectar com Mercado Pago.')
    } finally {
      setGerandoLinkMP(false)
    }
  }

  // Finalizar Venda Direta
  const handleFinalizarVenda = async () => {
    if (!nomeCliente.trim()) {
      alert('Informe o Nome da Cliente.')
      return
    }

    if (!telefoneCliente.trim()) {
      alert('Informe o Telefone / WhatsApp da Cliente.')
      return
    }

    if (itensVenda.length === 0) {
      alert('Adicione ao menos um produto na venda.')
      return
    }

    if (modalidadeEntrega === 'correios' && !dadosEndereco.cep) {
      alert('Informe o CEP de entrega.')
      return
    }

    try {
      setProcessandoVenda(true)

      const payloadItens = itensVenda.map((it) => ({
        produto_id: it.produtoId,
        variacao_id: it.variacaoId || null,
        cor: it.cor || 'Única',
        cor_hex: it.cor_hex || null,
        tamanho: it.tamanho || 'Único',
        quantidade: it.quantidade,
        custo: it.custo || 0,
        preco_original: it.precoOriginal || 0,
        preco_praticado: it.precoPraticado || 0,
        desconto_percentual: it.descontoPercentual || 0,
        desconto_valor: it.descontoValor || 0,
        preco: it.precoLiquido,
        subtotal: it.subtotal
      }))

      const payloadEntrega = {
        modalidade: modalidadeEntrega,
        valor_frete: valorFreteAtual,
        cep: normalizarCep(dadosEndereco.cep),
        endereco: dadosEndereco.endereco,
        numero: dadosEndereco.numero,
        complemento: dadosEndereco.complemento,
        bairro: dadosEndereco.bairro,
        cidade: dadosEndereco.cidade,
        estado: dadosEndereco.estado,
        transportadora: modalidadeEntrega === 'correios' ? freteMelhorEnvioSelecionado?.transportadora : (modalidadeEntrega === 'motoboy_loja' ? 'Motoboy Loja' : 'Retirada'),
        servico: modalidadeEntrega === 'correios' ? freteMelhorEnvioSelecionado?.servico : null,
        prazo: modalidadeEntrega === 'correios' ? freteMelhorEnvioSelecionado?.prazo_texto : null
      }

      const res = await criarVendaDireta({
        cliente: nomeCliente.trim(),
        telefone: telefoneCliente.trim(),
        email: emailCliente.trim() || null,
        itens: payloadItens,
        modalidadeEntrega,
        dadosEntrega: payloadEntrega,
        formaPagamento,
        observacaoInterna: observacaoInterna.trim() || null,
        atendente: usuarioLogado?.user_metadata?.name || usuarioLogado?.email || 'Admin',
        idempotencyKey: crypto.randomUUID()
      })

      if (!res.sucesso || !res.pedido) {
        alert(res.mensagem || 'Não foi possível finalizar a venda direta.')
        return
      }

      // Se havia rascunho vinculado, exclui para não poluir
      if (rascunhoAtualId) {
        await excluirRascunhoVendaDireta(rascunhoAtualId)
      }

      setPedidoFinalizado(res.pedido)

      // Atualiza lista de produtos local para refletir o novo estoque
      const novosProds = await carregarProdutos()
      setProdutos(novosProds || [])
    } catch (err) {
      console.error('Erro ao finalizar venda direta:', err)
      alert(err.message || 'Erro inesperado ao finalizar venda.')
    } finally {
      setProcessandoVenda(false)
    }
  }

  return (
    <div className="venda-direta-page">
      {/* Toast de Feedback de Cópia */}
      {feedbackCopia && (
        <div className="venda-toast-feedback">
          {feedbackCopia}
        </div>
      )}

      {/* CABEÇALHO */}
      <header className="venda-direta-header">
        <div>
          <span className="venda-badge-modulo">PDV WHATSAPP & ATENDIMENTO</span>
          <h1>Nova Venda Direta</h1>
          <p>Monte a venda, aplique descontos, cote fretes e gere pedidos integrados.</p>
        </div>

        <div className="venda-topo-botoes">
          <button
            type="button"
            className="btn-venda-secundario"
            onClick={() => setMostrarRascunhosModal(true)}
            title="Ver rascunhos de vendas não finalizadas"
          >
            📋 Rascunhos {rascunhos.length > 0 && <span className="badge-qtd">{rascunhos.length}</span>}
          </button>

          <button
            type="button"
            className="btn-venda-secundario"
            onClick={handleSalvarRascunho}
            title="Salvar venda atual como rascunho para continuar depois"
          >
            💾 Salvar Rascunho
          </button>

          <button
            type="button"
            className="btn-venda-secundario"
            onClick={handleNovoAtendimento}
            title="Limpar formulário e iniciar novo atendimento"
          >
            ✨ Novo Atendimento
          </button>
        </div>
      </header>

      <div className="venda-direta-grid-layout">
        {/* COLUNA ESQUERDA: MONTAGEM DA VENDA */}
        <div className="venda-coluna-esquerda">
          {/* SEÇÃO 1: ADICIONAR PRODUTO */}
          <section className="venda-card-secao">
            <div className="secao-titulo-wrap">
              <span className="secao-num">1</span>
              <div>
                <h2>{indiceItemEditando !== null ? 'Editar Produto na Venda' : 'Adicionar Produto'}</h2>
                <small>Selecione um produto do estoque cadastrado para incluir no pedido.</small>
              </div>
            </div>

            <form className="form-adicionar-produto" onSubmit={handleAdicionarItem}>
              {/* BUSCA DE PRODUTO */}
              <div className="form-campo-busca-prod">
                <label>Pesquisar Produto (Nome ou SKU) *</label>
                <div className="input-busca-wrap">
                  <input
                    type="text"
                    value={buscaProduto}
                    onChange={(e) => {
                      setBuscaProduto(e.target.value)
                      if (!e.target.value) setProdutoSelecionado(null)
                    }}
                    placeholder="Digite o nome do vestido, blusa ou código SKU..."
                    autoComplete="off"
                  />
                  {produtoSelecionado && (
                    <button
                      type="button"
                      className="btn-limpar-selecao-prod"
                      onClick={() => {
                        setProdutoSelecionado(null)
                        setBuscaProduto('')
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* AUTOCOMPLETE LIST */}
                {!produtoSelecionado && produtosFiltrados.length > 0 && (
                  <div className="autocomplete-produtos-lista">
                    {produtosFiltrados.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className="autocomplete-item"
                        onClick={() => handleSelecionarProduto(p)}
                      >
                        <div className="auto-foto">
                          {p.foto ? <img src={p.foto} alt={p.nome} /> : '👗'}
                        </div>
                        <div className="auto-info">
                          <strong>{p.nome}</strong>
                          <span>
                            {p.sku ? `SKU: ${p.sku} • ` : ''}
                            Estoque: {p.quantidade} un. • {formatarPreco(p.venda)}
                          </span>
                        </div>
                        <span className="auto-btn-add">Selecionar</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* SELETORES DE VARIAÇÃO / TAMANHO / NEGOCIAÇÃO */}
              {produtoSelecionado && (
                <div className="area-detalhes-produto-selecionado">
                  <div className="grid-produto-negociacao">
                    {/* SELEÇÃO DE COR */}
                    <div className="form-grupo">
                      <label>Cor *</label>
                      <select
                        value={variacaoSelecionada?.id || ''}
                        onChange={(e) => {
                          const vId = Number(e.target.value) || null
                          const vEnc = produtoSelecionado.variacoes?.find((v) => v.id === vId)
                          setVariacaoSelecionada(vEnc || null)
                          const novoTam = vEnc?.tamanhos?.find((t) => t.quantidade > 0) || vEnc?.tamanhos?.[0]
                          setTamanhoSelecionado(novoTam?.tamanho || '')
                        }}
                      >
                        {coresDisponiveis.map((c) => (
                          <option key={c.id || 'unica'} value={c.id || ''}>
                            {c.cor}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* SELEÇÃO DE TAMANHO */}
                    <div className="form-grupo">
                      <label>Tamanho *</label>
                      <select
                        value={tamanhoSelecionado}
                        onChange={(e) => setTamanhoSelecionado(e.target.value)}
                      >
                        {tamanhosDisponiveis.map((t) => (
                          <option key={t.id || t.tamanho} value={t.tamanho}>
                            {t.tamanho} ({t.quantidade} un. em estoque)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* QUANTIDADE */}
                    <div className="form-grupo">
                      <label>Quantidade *</label>
                      <input
                        type="number"
                        min="1"
                        max={Math.max(1, estoqueDisponivel)}
                        value={quantidadeItem}
                        onChange={(e) => setQuantidadeItem(Math.max(1, Number(e.target.value)))}
                      />
                    </div>

                    {/* CUSTO INTERNO (AUTOMÁTICO - BLOQUEADO) */}
                    <div className="form-grupo custo-grupo">
                      <label>Custo Unit. (Interno)</label>
                      <input
                        type="text"
                        disabled
                        value={formatarPreco(custoUnitario)}
                        title="Custo cadastrado no produto - preservado historicamente"
                      />
                    </div>

                    {/* PREÇO DE VENDA NEGOCIADO */}
                    <div className="form-grupo">
                      <label>Preço Venda (R$) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={precoPraticadoItem}
                        onChange={(e) => setPrecoPraticadoItem(Number(e.target.value))}
                        title="Preço de tabela preenchido inicialmente. Ajustável para esta negociação."
                      />
                    </div>

                    {/* DESCONTO (%) */}
                    <div className="form-grupo">
                      <label>Desconto (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={descontoPercentualItem}
                        onChange={(e) => setDescontoPercentualItem(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* RESUMO DO ITEM ANTES DE INCLUIR */}
                  <div className="resumo-calculo-item-box">
                    <div className="resumo-calc-valores">
                      <span>Preço Negociado: <strong>{formatarPreco(precoPraticadoItem)}</strong></span>
                      {descontoPercentualItem > 0 && (
                        <span>Desc. {descontoPercentualItem}%: <strong className="texto-desconto">- {formatarPreco(calculoItemAtual.descontoUnitario)}</strong></span>
                      )}
                      <span>Líquido Unit.: <strong>{formatarPreco(calculoItemAtual.precoLiquido)}</strong></span>
                      <span>Total ({quantidadeItem} un.): <strong className="texto-destaque">{formatarPreco(calculoItemAtual.precoLiquido * quantidadeItem)}</strong></span>
                    </div>

                    <div className="botoes-acao-item">
                      {indiceItemEditando !== null && (
                        <button
                          type="button"
                          className="btn-cancelar-edicao-item"
                          onClick={() => {
                            setIndiceItemEditando(null)
                            setProdutoSelecionado(null)
                            setBuscaProduto('')
                          }}
                        >
                          Cancelar
                        </button>
                      )}
                      <button type="submit" className="btn-adicionar-item-venda">
                        {indiceItemEditando !== null ? '✓ Salvar Alterações' : '+ Adicionar Item'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </section>

          {/* SEÇÃO 2: TABELA DE ITENS DA VENDA */}
          <section className="venda-card-secao">
            <div className="secao-titulo-wrap">
              <span className="secao-num">2</span>
              <div>
                <h2>Itens na Venda ({itensVenda.length})</h2>
                <small>Confira todos os produtos negociados neste atendimento.</small>
              </div>
            </div>

            {itensVenda.length === 0 ? (
              <div className="venda-itens-vazio">
                <span>🛍️</span>
                <p>Nenhum produto adicionado ainda.</p>
                <small>Pesquise e selecione um produto acima para montar o pedido.</small>
              </div>
            ) : (
              <div className="tabela-itens-venda-wrapper">
                <table className="tabela-itens-venda">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Cor / Tam</th>
                      <th>Qtd</th>
                      <th>Custo</th>
                      <th>Venda</th>
                      <th>Desc (%)</th>
                      <th>Total</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensVenda.map((it, idx) => (
                      <tr key={`${it.produtoId}-${it.cor}-${it.tamanho}-${idx}`}>
                        <td>
                          <strong>{it.nome}</strong>
                          {it.sku && <small className="item-sku-tag">SKU: {it.sku}</small>}
                        </td>
                        <td>
                          <span className="badge-variacao">
                            {it.cor} / <strong>{it.tamanho}</strong>
                          </span>
                        </td>
                        <td><strong>{it.quantidade}</strong></td>
                        <td><span className="badge-custo-interno">{formatarPreco(it.custo)}</span></td>
                        <td>{formatarPreco(it.precoPraticado)}</td>
                        <td>
                          {it.descontoPercentual > 0 ? (
                            <span className="badge-desconto-aplicado">{it.descontoPercentual}%</span>
                          ) : (
                            '0%'
                          )}
                        </td>
                        <td><strong className="item-total-destaque">{formatarPreco(it.subtotal)}</strong></td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="acoes-item-tabela">
                            <button
                              type="button"
                              className="btn-acao-editar"
                              onClick={() => handleEditarItem(idx)}
                              title="Editar este item"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="btn-acao-remover"
                              onClick={() => handleRemoverItem(idx)}
                              title="Remover este item"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SEÇÃO 3: DADOS DA CLIENTE */}
          <section className="venda-card-secao">
            <div className="secao-titulo-wrap">
              <span className="secao-num">3</span>
              <div>
                <h2>Dados da Cliente</h2>
                <small>Informações para registro do pedido e envio de notificações.</small>
              </div>
            </div>

            <div className="grid-dados-cliente">
              <div className="form-grupo">
                <label>Nome Completo da Cliente *</label>
                <input
                  type="text"
                  value={nomeCliente}
                  onChange={(e) => setNomeCliente(e.target.value)}
                  placeholder="Ex: Maria Silva"
                  required
                />
              </div>

              <div className="form-grupo">
                <label>Telefone / WhatsApp *</label>
                <input
                  type="tel"
                  value={telefoneCliente}
                  onChange={(e) => setTelefoneCliente(normalizarTelefone(e.target.value))}
                  placeholder="(11) 99999-9999"
                  required
                />
              </div>

              <div className="form-grupo">
                <label>E-mail <span className="label-opcional">(Opcional)</span></label>
                <input
                  type="email"
                  value={emailCliente}
                  onChange={(e) => setEmailCliente(e.target.value)}
                  placeholder="cliente@exemplo.com"
                />
              </div>
            </div>

            <div className="form-grupo" style={{ marginTop: '10px' }}>
              <label>Observação Interna do Atendimento</label>
              <textarea
                rows="2"
                value={observacaoInterna}
                onChange={(e) => setObservacaoInterna(e.target.value)}
                placeholder="Anotações internas da conversa pelo WhatsApp, preferências, etc..."
              />
            </div>
          </section>
        </div>

        {/* COLUNA DIREITA: ENTREGA, PAGAMENTO E FINALIZAÇÃO */}
        <div className="venda-coluna-direita">
          {/* SEÇÃO 4: ENTREGA & FRETE */}
          <section className="venda-card-secao">
            <div className="secao-titulo-wrap">
              <span className="secao-num">4</span>
              <div>
                <h2>Modalidade de Entrega</h2>
                <small>Selecione a forma de envio combinada no WhatsApp.</small>
              </div>
            </div>

            <div className="opcoes-modalidade-entrega">
              <label className={`radio-card-entrega ${modalidadeEntrega === 'correios' ? 'ativo' : ''}`}>
                <input
                  type="radio"
                  name="modalidadeEntrega"
                  value="correios"
                  checked={modalidadeEntrega === 'correios'}
                  onChange={() => setModalidadeEntrega('correios')}
                />
                <div className="radio-card-info">
                  <strong>📦 Correios / Transportadora</strong>
                  <span>Cotação via Melhor Envio (PAC / SEDEX)</span>
                </div>
              </label>

              <label className={`radio-card-entrega ${modalidadeEntrega === 'motoboy_loja' ? 'ativo' : ''}`}>
                <input
                  type="radio"
                  name="modalidadeEntrega"
                  value="motoboy_loja"
                  checked={modalidadeEntrega === 'motoboy_loja'}
                  onChange={() => setModalidadeEntrega('motoboy_loja')}
                />
                <div className="radio-card-info">
                  <strong>🛵 Motoboy da Loja</strong>
                  <span>Taxa manual de entrega</span>
                </div>
              </label>

              <label className={`radio-card-entrega ${modalidadeEntrega === 'motoboy_cliente' ? 'ativo' : ''}`}>
                <input
                  type="radio"
                  name="modalidadeEntrega"
                  value="motoboy_cliente"
                  checked={modalidadeEntrega === 'motoboy_cliente'}
                  onChange={() => setModalidadeEntrega('motoboy_cliente')}
                />
                <div className="radio-card-info">
                  <strong>🏍️ Motoboy da Cliente</strong>
                  <span>Retirada por conta da cliente (Frete R$ 0,00)</span>
                </div>
              </label>

              <label className={`radio-card-entrega ${modalidadeEntrega === 'retirada' ? 'ativo' : ''}`}>
                <input
                  type="radio"
                  name="modalidadeEntrega"
                  value="retirada"
                  checked={modalidadeEntrega === 'retirada'}
                  onChange={() => setModalidadeEntrega('retirada')}
                />
                <div className="radio-card-info">
                  <strong>🏪 Retirada Combinada</strong>
                  <span>Cliente retira na loja física (Frete R$ 0,00)</span>
                </div>
              </label>
            </div>

            {/* CAMPOS ESPECÍFICOS POR MODALIDADE */}
            {modalidadeEntrega === 'motoboy_loja' && (
              <div className="bloco-campo-motoboy">
                <label>Valor da Taxa do Motoboy (R$) *</label>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  value={valorMotoboyLoja}
                  onChange={(e) => setValorMotoboyLoja(e.target.value)}
                  placeholder="Ex: 25.00"
                />
              </div>
            )}

            {/* ENDEREÇO DE ENTREGA (CORREIOS OU MOTOBOY) */}
            {(modalidadeEntrega === 'correios' || modalidadeEntrega === 'motoboy_loja') && (
              <div className="bloco-endereco-completo">
                <div className="form-campo-cep-busca">
                  <label>CEP de Destino *</label>
                  <div className="input-cep-wrap">
                    <input
                      type="text"
                      maxLength="9"
                      value={dadosEndereco.cep}
                      onChange={(e) => setDadosEndereco({ ...dadosEndereco, cep: formatarCep(e.target.value) })}
                      placeholder="00000-000"
                    />
                    <button
                      type="button"
                      className="btn-calcular-frete-me"
                      onClick={handleCalcularFreteMelhorEnvio}
                      disabled={calculandoFrete}
                    >
                      {calculandoFrete ? 'Calculando...' : 'Cotar Frete'}
                    </button>
                  </div>
                  {mensagemFrete && <small className="aviso-frete-status">{mensagemFrete}</small>}
                </div>

                {/* OPÇÕES DO MELHOR ENVIO */}
                {modalidadeEntrega === 'correios' && opcoesFreteMelhorEnvio.length > 0 && (
                  <div className="lista-opcoes-melhor-envio">
                    <label>Selecione o Serviço de Envio:</label>
                    {opcoesFreteMelhorEnvio.map((opt) => (
                      <label
                        key={opt.id}
                        className={`opcao-frete-card ${freteMelhorEnvioSelecionado?.id === opt.id ? 'selecionado' : ''}`}
                      >
                        <input
                          type="radio"
                          name="opcaoFreteME"
                          checked={freteMelhorEnvioSelecionado?.id === opt.id}
                          onChange={() => setFreteMelhorEnvioSelecionado(opt)}
                        />
                        <div className="frete-card-texto">
                          <strong>{opt.servico} ({opt.transportadora})</strong>
                          <span>{opt.prazo_texto}</span>
                        </div>
                        <strong className="frete-card-preco">{formatarPreco(opt.preco)}</strong>
                      </label>
                    ))}
                  </div>
                )}

                {/* FORMULÁRIO DO ENDEREÇO */}
                <div className="grid-campos-endereco">
                  <div className="form-grupo end-rua">
                    <label>Rua / Logradouro</label>
                    <input
                      type="text"
                      value={dadosEndereco.endereco}
                      onChange={(e) => setDadosEndereco({ ...dadosEndereco, endereco: e.target.value })}
                      placeholder="Ex: Av. Paulista"
                    />
                  </div>

                  <div className="form-grupo end-num">
                    <label>Número</label>
                    <input
                      type="text"
                      value={dadosEndereco.numero}
                      onChange={(e) => setDadosEndereco({ ...dadosEndereco, numero: e.target.value })}
                      placeholder="123"
                    />
                  </div>

                  <div className="form-grupo end-comp">
                    <label>Complemento</label>
                    <input
                      type="text"
                      value={dadosEndereco.complemento}
                      onChange={(e) => setDadosEndereco({ ...dadosEndereco, complemento: e.target.value })}
                      placeholder="Apto 45"
                    />
                  </div>

                  <div className="form-grupo end-bairro">
                    <label>Bairro</label>
                    <input
                      type="text"
                      value={dadosEndereco.bairro}
                      onChange={(e) => setDadosEndereco({ ...dadosEndereco, bairro: e.target.value })}
                      placeholder="Bela Vista"
                    />
                  </div>

                  <div className="form-grupo end-cid">
                    <label>Cidade</label>
                    <input
                      type="text"
                      value={dadosEndereco.cidade}
                      onChange={(e) => setDadosEndereco({ ...dadosEndereco, cidade: e.target.value })}
                      placeholder="São Paulo"
                    />
                  </div>

                  <div className="form-grupo end-est">
                    <label>Estado</label>
                    <input
                      type="text"
                      maxLength="2"
                      value={dadosEndereco.estado}
                      onChange={(e) => setDadosEndereco({ ...dadosEndereco, estado: e.target.value.toUpperCase() })}
                      placeholder="SP"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* SEÇÃO 5: PAGAMENTO */}
          <section className="venda-card-secao">
            <div className="secao-titulo-wrap">
              <span className="secao-num">5</span>
              <div>
                <h2>Forma de Pagamento</h2>
                <small>Defina como a cliente fará o acerto do pedido.</small>
              </div>
            </div>

            <div className="opcoes-forma-pagamento">
              <button
                type="button"
                className={`btn-opcao-pagamento ${formaPagamento === 'Pix' ? 'ativo' : ''}`}
                onClick={() => setFormaPagamento('Pix')}
              >
                💠 PIX (Chave Fixa da Loja)
              </button>

              <button
                type="button"
                className={`btn-opcao-pagamento ${formaPagamento === 'Cartão de crédito' ? 'ativo' : ''}`}
                onClick={() => setFormaPagamento('Cartão de crédito')}
              >
                💳 Cartão (Mercado Pago)
              </button>
            </div>

            {/* DETALHES DO PIX FIXO */}
            {formaPagamento === 'Pix' && (
              <div className="bloco-pix-fixo-info">
                <div className="pix-fixo-cabecalho">
                  <strong>Bazar Encanto Feminino</strong>
                  <span>Beneficiário: {configPix.beneficiario || 'Bazar Encanto'}</span>
                </div>
                <div className="pix-chave-copia-wrap">
                  <code>{configPix.chavePix || 'bazarencanto610@gmail.com'}</code>
                  <button
                    type="button"
                    className="btn-copiar-chave-pix"
                    onClick={() => copiarTexto(configPix.chavePix || 'bazarencanto610@gmail.com', 'Chave Pix copiada.')}
                  >
                    📋 Copiar Pix
                  </button>
                </div>
                <small className="aviso-confirmacao-pix">
                  ℹ️ O pedido iniciará como <strong>Aguardando pagamento</strong>. A confirmação manual do Pix será feita no Admin após o recebimento do comprovante.
                </small>
              </div>
            )}

            {/* DETALHES DO CARTÃO (LINK MERCADO PAGO) */}
            {formaPagamento === 'Cartão de crédito' && (
              <div className="bloco-cartao-link-info">
                <button
                  type="button"
                  className="btn-gerar-link-mp"
                  onClick={handleGerarLinkMP}
                  disabled={gerandoLinkMP || totaisGerais.totalFinal <= 0}
                >
                  {gerandoLinkMP ? 'Gerando Link...' : '💳 Gerar Link de Pagamento (Mercado Pago)'}
                </button>

                {linkMercadoPagoGerado && (
                  <div className="link-mp-gerado-wrap">
                    <input type="text" readOnly value={linkMercadoPagoGerado} />
                    <button
                      type="button"
                      className="btn-copiar-link-mp"
                      onClick={() => copiarTexto(linkMercadoPagoGerado, 'Link de pagamento copiado!')}
                    >
                      📋 Copiar Link
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* SEÇÃO 6: RESUMO FINANCEIRO & FINALIZAR */}
          <section className="venda-card-secao card-resumo-final">
            <h2>Resumo da Venda</h2>

            <div className="linhas-resumo-financeiro">
              <div className="linha-resumo">
                <span>Subtotal Produtos:</span>
                <strong>{formatarPreco(totaisGerais.subtotalBruto)}</strong>
              </div>

              {totaisGerais.totalDescontos > 0 && (
                <div className="linha-resumo desconto">
                  <span>Descontos Aplicados:</span>
                  <strong>- {formatarPreco(totaisGerais.totalDescontos)}</strong>
                </div>
              )}

              <div className="linha-resumo">
                <span>Total Produtos:</span>
                <strong>{formatarPreco(totaisGerais.totalProdutos)}</strong>
              </div>

              <div className="linha-resumo">
                <span>Frete ({modalidadeEntrega}):</span>
                <strong>{valorFreteAtual === 0 ? 'Grátis (R$ 0,00)' : formatarPreco(valorFreteAtual)}</strong>
              </div>

              <div className="linha-resumo total-destaque">
                <span>TOTAL FINAL:</span>
                <span>{formatarPreco(totaisGerais.totalFinal)}</span>
              </div>
            </div>

            <div className="botoes-finais-venda">
              <button
                type="button"
                className="btn-copiar-resumo-wpp"
                onClick={() => {
                  const texto = montarResumoWhatsApp({
                    cliente: nomeCliente,
                    itens: itensVenda,
                    valorFrete: valorFreteAtual,
                    modalidadeEntrega,
                    formaPagamento,
                    chavePix: configPix.chavePix
                  })
                  copiarTexto(texto, 'Resumo do pedido copiado para o WhatsApp!')
                }}
                disabled={itensVenda.length === 0}
                title="Copia uma mensagem com a lista de itens, valores e frete"
              >
                📋 Copiar Resumo para WhatsApp
              </button>

              <button
                type="button"
                className="btn-finalizar-venda-principal"
                onClick={handleFinalizarVenda}
                disabled={processandoVenda || itensVenda.length === 0}
              >
                {processandoVenda ? 'Validando Estoque e Emitindo...' : '🚀 FINALIZAR VENDA'}
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* MODAL DE SUCESSO: VENDA FINALIZADA COM CÓDIGO SEGURO */}
      {pedidoFinalizado && (
        <div className="venda-modal-overlay">
          <div className="venda-modal-sucesso">
            <div className="venda-sucesso-icone">🎉</div>
            <h2>Venda Direta Finalizada com Sucesso!</h2>
            <p>O pedido foi registrado no sistema e o estoque foi devidamente baixado.</p>

            <div className="cards-sucesso-pedido-grid">
              <div className="card-suc-item">
                <span>NÚMERO DO PEDIDO</span>
                <strong>{pedidoFinalizado.numero}</strong>
                <button
                  type="button"
                  className="btn-copiar-mini"
                  onClick={() => copiarTexto(pedidoFinalizado.numero, 'Nº do pedido copiado!')}
                >
                  📋 Copiar Nº
                </button>
              </div>

              <div className="card-suc-item destaque-codigo">
                <span>CÓDIGO DE ACOMPANHAMENTO</span>
                <code>{pedidoFinalizado.codigo_acompanhamento}</code>
                <button
                  type="button"
                  className="btn-copiar-mini"
                  onClick={() => copiarTexto(pedidoFinalizado.codigo_acompanhamento, 'Código copiado!')}
                >
                  📋 Copiar Código
                </button>
              </div>

              <div className="card-suc-item">
                <span>TOTAL FINAL</span>
                <strong>{formatarPreco(pedidoFinalizado.total)}</strong>
              </div>
            </div>

            <div className="acoes-modal-sucesso">
              <button
                type="button"
                className="btn-copiar-msg-completa-wpp"
                onClick={() => {
                  const msg = montarMensagemFinalWhatsApp({
                    pedido: pedidoFinalizado,
                    chavePix: configPix.chavePix,
                    linkPagamento: linkMercadoPagoGerado
                  })
                  copiarTexto(msg, 'Mensagem pronta para WhatsApp copiada!')
                }}
              >
                💬 Copiar Mensagem Pronta para WhatsApp
              </button>

              <div className="grupo-botoes-pos-venda">
                <button
                  type="button"
                  className="btn-novo-pos-venda"
                  onClick={handleNovoAtendimento}
                >
                  + Nova Venda Direta
                </button>

                <button
                  type="button"
                  className="btn-ir-pedidos"
                  onClick={() => {
                    if (setPagina) setPagina('pedidos')
                  }}
                >
                  🛍️ Ver Pedidos no Admin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RASCUNHOS SALVOS */}
      {mostrarRascunhosModal && (
        <div className="venda-modal-overlay">
          <div className="venda-modal-rascunhos">
            <div className="rascunhos-modal-header">
              <h3>Rascunhos de Venda Salvos ({rascunhos.length})</h3>
              <button type="button" onClick={() => setMostrarRascunhosModal(false)}>✕</button>
            </div>

            <div className="rascunhos-modal-corpo">
              {rascunhos.length === 0 ? (
                <p className="sem-rascunhos">Nenhum rascunho salvo no momento.</p>
              ) : (
                <div className="lista-rascunhos-cards">
                  {rascunhos.map((r) => (
                    <div
                      key={r.id}
                      className="card-rascunho-item"
                      onClick={() => handleAbrirRascunho(r)}
                    >
                      <div className="rascunho-info">
                        <strong>{r.cliente || 'Cliente sem nome'}</strong>
                        <span>{r.telefone || 'Sem telefone'} • {Array.isArray(r.itens) ? `${r.itens.length} item(ns)` : '0 itens'}</span>
                        <small>Atualizado em: {new Date(r.atualizado_em).toLocaleString('pt-BR')}</small>
                      </div>
                      <div className="rascunho-acoes">
                        <button
                          type="button"
                          className="btn-excluir-rascunho"
                          onClick={(e) => handleExcluirRascunho(r.id, e)}
                          title="Excluir este rascunho"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
