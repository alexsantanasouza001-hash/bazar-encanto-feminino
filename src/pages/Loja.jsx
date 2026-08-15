import { useEffect, useRef, useState } from 'react'

import './Loja.css'

import Carrinho from './Carrinho'
import Checkout from './Checkout'
import PedidoCompleto from './PedidoCompleto'
import ClienteAuth from '../components/ClienteAuth'
import Footer from '../components/Footer'
import {
  calcularTotaisCupom,
  resolverAplicacaoCupom
} from './checkoutCoupons'
import {
  calcularRegraFrete,
  normalizarCepFrete
} from './checkoutShipping'
import { supabase } from '../lib/supabase'

import {
  carregarProdutos,
  registrarPagamento
} from '../storage'

function formatarPreco(valor) {
  return Number(
    valor || 0
  ).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  )
}

const DADOS_ENTREGA_INICIAIS = {
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: ''
}

const DADOS_CLIENTE_INICIAIS = {
  nome: '',
  sobrenome: '',
  email: '',
  telefone: '',
  cpf: '',
  ...DADOS_ENTREGA_INICIAIS
}

function Loja({ onNavegar }) {
  const [produtos, setProdutos] = useState([])
  const [categoriaAtiva, setCategoriaAtiva] = useState('Todos')
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState('novidades')
  const [detalheProdutoModal, setDetalheProdutoModal] = useState(null)
  const [carrinho, setCarrinho] = useState([])
  const [nomeCliente, setNomeCliente] = useState('')

  const [
    carrinhoAberto,
    setCarrinhoAberto
  ] = useState(false)

  const [
    carregandoProdutos,
    setCarregandoProdutos
  ] = useState(true)

  const [
    fotoAtiva,
    setFotoAtiva
  ] = useState({})

  const [
    lightbox,
    setLightbox
  ] = useState(null)

  const [
    feedbackProduto,
    setFeedbackProduto
  ] = useState(null)

  const [
    tamanhoSelecionado,
    setTamanhoSelecionado
  ] = useState({})

  const [
    etapaCheckout,
    setEtapaCheckout
  ] = useState('loja')

  const [
    dadosCliente,
    setDadosCliente
  ] = useState(
    DADOS_CLIENTE_INICIAIS
  )

  const [
    salvarDados,
    setSalvarDados
  ] = useState(false)

  const [
    formaPagamento,
    setFormaPagamento
  ] = useState('')

  const [
    aceitouTermos,
    setAceitouTermos
  ] = useState(false)

  const [
    finalizando,
    setFinalizando
  ] = useState(false)

  const [
    erroCheckout,
    setErroCheckout
  ] = useState('')

  const [
    pedidoFinalizado,
    setPedidoFinalizado
  ] = useState(null)

  const [
    perfilAberto,
    setPerfilAberto
  ] = useState(false)

  const [
    codigoCupom,
    setCodigoCupom
  ] = useState('')

  const [
    cupomAplicado,
    setCupomAplicado
  ] = useState(null)

  const [
    mensagemCupom,
    setMensagemCupom
  ] = useState(null)

  const [
    cepEntregaConfirmado,
    setCepEntregaConfirmado
  ] = useState(null)

  const [
    sessaoCliente,
    setSessaoCliente
  ] = useState(null)

  const [
    carregandoSessao,
    setCarregandoSessao
  ] = useState(true)

  const [
    recuperacaoSenhaAtiva,
    setRecuperacaoSenhaAtiva
  ] = useState(false)

  const idempotencyKeyRef =
    useRef(null)

  const finalizandoRef =
    useRef(false)

  const lightboxDialogRef =
    useRef(null)

  const lightboxTriggerRef =
    useRef(null)

  const feedbackTimeoutRef =
    useRef(null)

  const bloqueiosAdicionarRef =
    useRef(new Set())

  const temporizadoresAdicionarRef =
    useRef(new Set())

  const lightboxAberto =
    Boolean(lightbox)

  useEffect(() => {
    idempotencyKeyRef.current =
      null
  }, [carrinho])

  useEffect(() => {
    if (carrinho.length > 0) {
      return
    }

    setCepEntregaConfirmado(null)
    setDadosCliente(
      (dadosAtuais) => {
        const entregaJaLimpa =
          Object.keys(
            DADOS_ENTREGA_INICIAIS
          ).every(
            (campo) =>
              !dadosAtuais[campo]
          )

        if (entregaJaLimpa) {
          return dadosAtuais
        }

        return {
          ...dadosAtuais,
          ...DADOS_ENTREGA_INICIAIS
        }
      }
    )
  }, [carrinho.length])

  useEffect(() => {
    if (!lightboxAberto) {
      return undefined
    }

    const overflowAnterior =
      document.body.style.overflow

    const tratarTeclado = (evento) => {
      if (evento.key === 'Escape') {
        setLightbox(null)
        return
      }

      if (evento.key === 'ArrowLeft') {
        evento.preventDefault()
        navegarLightbox(-1)
        return
      }

      if (evento.key === 'ArrowRight') {
        evento.preventDefault()
        navegarLightbox(1)
        return
      }

      if (evento.key !== 'Tab') {
        return
      }

      const elementos =
        lightboxDialogRef.current
          ?.querySelectorAll(
            'button:not(:disabled), [tabindex]:not([tabindex="-1"])'
          ) || []

      if (elementos.length === 0) {
        evento.preventDefault()
        return
      }

      const primeiro = elementos[0]
      const ultimo =
        elementos[
          elementos.length - 1
        ]

      if (
        evento.shiftKey &&
        document.activeElement ===
          primeiro
      ) {
        evento.preventDefault()
        ultimo.focus()
      } else if (
        !evento.shiftKey &&
        document.activeElement ===
          ultimo
      ) {
        evento.preventDefault()
        primeiro.focus()
      }
    }

    document.body.style.overflow =
      'hidden'
    document.addEventListener(
      'keydown',
      tratarTeclado
    )

    const foco = window.setTimeout(
      () => {
        lightboxDialogRef.current
          ?.querySelector(
            '.loja-lightbox-close'
          )
          ?.focus()
      },
      0
    )

    return () => {
      window.clearTimeout(foco)
      document.body.style.overflow =
        overflowAnterior
      document.removeEventListener(
        'keydown',
        tratarTeclado
      )
      lightboxTriggerRef.current
        ?.focus()
    }
  }, [lightboxAberto])

  useEffect(() => () => {
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(
        feedbackTimeoutRef.current
      )
    }

    temporizadoresAdicionarRef.current
      .forEach((temporizador) =>
        window.clearTimeout(
          temporizador
        )
      )
  }, [])

  // =====================================================
  // CARREGAR PRODUTOS
  // =====================================================

  useEffect(() => {
    let ativo = true

    async function carregar() {
      try {
        setCarregandoProdutos(true)

        const produtosSalvos =
          await carregarProdutos()

        if (
          ativo &&
          Array.isArray(
            produtosSalvos
          )
        ) {
          setProdutos(
            produtosSalvos
          )
        }
      } catch (erro) {
        console.error(
          'Erro ao carregar produtos da loja:',
          erro
        )

        if (ativo) {
          setProdutos([])
        }
      } finally {
        if (ativo) {
          setCarregandoProdutos(
            false
          )
        }
      }
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [])

  // =====================================================
  // SESSÃO DA CLIENTE - SUPABASE AUTH
  // =====================================================

  useEffect(() => {
    let ativo = true

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!ativo) {
          return
        }

        if (error) {
          console.error(
            'Erro ao carregar sessão da cliente:',
            error.message
          )
        }

        setSessaoCliente(
          data?.session || null
        )
        setCarregandoSessao(false)
      })

    const {
      data: { subscription }
    } = supabase.auth
      .onAuthStateChange(
        (evento, sessao) => {
          if (!ativo) {
            return
          }

          setSessaoCliente(
            sessao || null
          )
          setCarregandoSessao(false)

          if (
            evento ===
            'PASSWORD_RECOVERY'
          ) {
            setRecuperacaoSenhaAtiva(
              true
            )
            setPerfilAberto(true)
          }
        }
      )

    return () => {
      ativo = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const usuario =
      sessaoCliente?.user

    if (!usuario) {
      return
    }

    const metadata =
      usuario.user_metadata || {}

    setDadosCliente(
      (dadosAtuais) => ({
        ...dadosAtuais,
        nome:
          metadata.nome ||
          dadosAtuais.nome,
        sobrenome:
          metadata.sobrenome ||
          dadosAtuais.sobrenome,
        email:
          usuario.email ||
          dadosAtuais.email,
        telefone:
          metadata.telefone ||
          dadosAtuais.telefone
      })
    )
  }, [sessaoCliente])

  // =====================================================
  // CATEGORIAS & PRODUTOS DISPONÍVEIS (BUSCA E ORDENAÇÃO)
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

  const produtosDisponiveis = produtos
    .filter((produto) => {
      if (produto?.ativo === false) {
        return false
      }
      const estoque = Number(produto.quantidade || 0)
      if (estoque <= 0) {
        return false
      }
      if (categoriaAtiva !== 'Todos' && produto.categoria !== categoriaAtiva) {
        return false
      }
      if (busca.trim()) {
        const termo = busca.toLowerCase().trim()
        const nome = String(produto.nome || '').toLowerCase()
        const sku = String(produto.sku || '').toLowerCase()
        const marca = String(produto.marca || '').toLowerCase()
        if (!nome.includes(termo) && !sku.includes(termo) && !marca.includes(termo)) {
          return false
        }
      }
      return true
    })
    .sort((a, b) => {
      if (ordenacao === 'menor-preco') {
        return Number(a.venda || 0) - Number(b.venda || 0)
      }
      if (ordenacao === 'maior-preco') {
        return Number(b.venda || 0) - Number(a.venda || 0)
      }
      if (ordenacao === 'nome') {
        return String(a.nome || '').localeCompare(String(b.nome || ''))
      }
      return Number(b.id || 0) - Number(a.id || 0)
    })

  // =====================================================
  // FOTOS DO PRODUTO
  // =====================================================

  const obterFotos = (produto) => {
    if (Array.isArray(produto.fotos) && produto.fotos.length > 0) {
      return produto.fotos
        .map((foto) => (typeof foto === 'string' ? foto : foto?.foto))
        .filter(Boolean)
    }
    if (produto.foto) {
      return [produto.foto]
    }
    return []
  }

  const obterIndiceFoto = (produto) => {
    const indice = Number(fotoAtiva[produto.id])
    if (Number.isFinite(indice) && indice >= 0 && indice < obterFotos(produto).length) {
      return indice
    }
    return 0
  }

  const mudarFoto = (
    produto,
    direcao
  ) => {
    const fotos =
      obterFotos(
        produto
      )

    if (
      fotos.length <= 1
    ) {
      return
    }

    const atual =
      obterIndiceFoto(
        produto
      )

    let proxima =
      atual +
      direcao

    if (
      proxima >=
      fotos.length
    ) {
      proxima = 0
    }

    if (
      proxima < 0
    ) {
      proxima =
        fotos.length - 1
    }

    setFotoAtiva(
      (atualState) => ({
        ...atualState,

        [produto.id]:
          proxima
      })
    )
  }

  const abrirLightbox = (
    produto,
    indice,
    evento
  ) => {
    const fotos =
      obterFotos(produto)

    if (fotos.length === 0) {
      return
    }

    lightboxTriggerRef.current =
      evento.currentTarget

    setLightbox({
      produtoId: produto.id,
      nome: produto.nome,
      fotos,
      indice
    })
  }

  const fecharLightbox = () => {
    setLightbox(null)
  }

  const navegarLightbox = (
    direcao
  ) => {
    setLightbox(
      (atual) => {
        if (
          !atual ||
          atual.fotos.length <= 1
        ) {
          return atual
        }

        const indice =
          (
            atual.indice +
            direcao +
            atual.fotos.length
          ) % atual.fotos.length

        return {
          ...atual,
          indice
        }
      }
    )
  }

  // =====================================================
  // TAMANHOS DO PRODUTO
  // =====================================================

  const obterTamanhos =
    (produto) => {
      if (
        Array.isArray(
          produto?.tamanhos
        ) &&
        produto.tamanhos.length >
          0
      ) {
        return produto.tamanhos.filter(
          (item) =>
            item &&
            typeof item.tamanho ===
              'string' &&
            item.tamanho.trim()
        )
      }

      return []
    }

  const selecionarTamanho =
    (
      produtoId,
      tamanho
    ) => {
      setTamanhoSelecionado(
        (atual) => ({
          ...atual,

          [produtoId]:
            tamanho
        })
      )

      if (
        String(
          feedbackProduto?.produtoId
        ) === String(produtoId)
      ) {
        setFeedbackProduto(null)
      }
    }

  // =====================================================
  // ADICIONAR AO CARRINHO
  // =====================================================

  const mostrarFeedbackProduto = (
    produtoId,
    tipo,
    mensagem
  ) => {
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(
        feedbackTimeoutRef.current
      )
    }

    setFeedbackProduto({
      produtoId,
      tipo,
      mensagem
    })

    feedbackTimeoutRef.current =
      window.setTimeout(() => {
        setFeedbackProduto(null)
        feedbackTimeoutRef.current =
          null
      }, 2200)
  }

  const adicionarCarrinho = (
    produto,
    abrirPainel = true
  ) => {
    const tamanhos =
      obterTamanhos(produto)

    const exigeTamanho =
      tamanhos.length > 0

    const tamanho =
      exigeTamanho
        ? tamanhoSelecionado[
            produto.id
          ]
        : null

    if (
      exigeTamanho &&
      !tamanho
    ) {
      mostrarFeedbackProduto(
        produto.id,
        'erro',
        'Selecione um tamanho para adicionar.'
      )
      return
    }

    const tamanhoProduto =
      exigeTamanho
        ? tamanhos.find(
            (item) =>
              item.tamanho ===
              tamanho
          )
        : null

    const estoque = Number(
      exigeTamanho
        ? tamanhoProduto?.quantidade ||
            0
        : produto.quantidade || 0
    )

    if (estoque <= 0) {
      mostrarFeedbackProduto(
        produto.id,
        'erro',
        exigeTamanho
          ? 'Esse tamanho não está disponível.'
          : 'Este produto está sem estoque.'
      )
      return
    }

    const chaveBloqueio =
      `${produto.id}-${
        tamanho || 'sem-tamanho'
      }`

    if (
      bloqueiosAdicionarRef.current
        .has(chaveBloqueio)
    ) {
      return
    }

    const itemExistente =
      carrinho.find(
        (item) =>
          String(item.id) ===
            String(produto.id) &&
          (item.tamanho || null) ===
            tamanho
      )

    const quantidadeAtual =
      Number(
        itemExistente?.quantidade ||
          0
      )

    if (quantidadeAtual >= estoque) {
      mostrarFeedbackProduto(
        produto.id,
        'erro',
        'Limite de estoque disponível atingido.'
      )
      return
    }

    bloqueiosAdicionarRef.current
      .add(chaveBloqueio)

    const temporizador =
      window.setTimeout(() => {
        bloqueiosAdicionarRef.current
          .delete(chaveBloqueio)
        temporizadoresAdicionarRef.current
          .delete(temporizador)
      }, 650)

    temporizadoresAdicionarRef.current
      .add(temporizador)

    setCarrinho(
      (carrinhoAtual) => {
        const existe =
          carrinhoAtual.some(
            (item) =>
              String(item.id) ===
                String(produto.id) &&
              (item.tamanho || null) ===
                tamanho
          )

        if (existe) {
          return carrinhoAtual.map(
            (item) =>
              String(item.id) ===
                String(produto.id) &&
              (item.tamanho || null) ===
                tamanho
                ? {
                    ...item,
                    quantidade:
                      Number(
                        item.quantidade ||
                          0
                      ) + 1
                  }
                : item
          )
        }

        return [
          ...carrinhoAtual,
          {
            ...produto,
            tamanho,
            quantidade: 1
          }
        ]
      }
    )

    mostrarFeedbackProduto(
      produto.id,
      'sucesso',
      'Adicionado ao carrinho.'
    )

    if (abrirPainel) {
      setCarrinhoAberto(true)
    }
  }

  // =====================================================
  // AUMENTAR QUANTIDADE
  // =====================================================

  const aumentarQuantidade =
    (id, tamanho) => {
      const produtoOriginal =
        produtos.find(
          (produto) =>
            String(
              produto.id
            ) ===
            String(id)
        )

      if (
        !produtoOriginal
      ) {
        return
      }

      const tamanhos =
        obterTamanhos(
          produtoOriginal
        )

      const tamanhoProduto =
        tamanhos.find(
          (item) =>
            item.tamanho ===
            tamanho
        )

      if (
        tamanhos.length > 0 &&
        !tamanhoProduto
      ) {
        return
      }

      const estoque =
        Number(
          tamanhos.length > 0
            ? tamanhoProduto.quantidade ||
                0
            : produtoOriginal.quantidade ||
                0
        )

      const itemCarrinho =
        carrinho.find(
          (item) =>
            String(
              item.id
            ) ===
              String(id) &&
            (item.tamanho || null) ===
              (tamanho || null)
        )

      if (
        !itemCarrinho
      ) {
        return
      }

      if (
        Number(
          itemCarrinho.quantidade ||
            0
        ) >= estoque
      ) {
        alert(
          'Não há mais unidades disponíveis deste tamanho.'
        )

        return
      }

      setCarrinho(
        (
          carrinhoAtual
        ) =>
          carrinhoAtual.map(
            (item) =>
              String(
                item.id
              ) ===
                String(id) &&
              (item.tamanho || null) ===
                (tamanho || null)
                ? {
                    ...item,

                    quantidade:
                      Number(
                        item.quantidade ||
                          0
                      ) + 1
                  }
                : item
          )
      )
    }

  // =====================================================
  // DIMINUIR QUANTIDADE
  // =====================================================

  const diminuirQuantidade =
    (id, tamanho) => {
      setCarrinho(
        (
          carrinhoAtual
        ) =>
          carrinhoAtual
            .map(
              (item) =>
                String(
                  item.id
                ) ===
                  String(id) &&
                item.tamanho ===
                  tamanho
                  ? {
                      ...item,

                      quantidade:
                        Number(
                          item.quantidade ||
                            0
                        ) - 1
                    }
                  : item
            )
            .filter(
              (item) =>
                Number(
                  item.quantidade ||
                    0
                ) > 0
            )
      )
    }

  // =====================================================
  // REMOVER PRODUTO
  // =====================================================

  const removerProduto =
    (id, tamanho) => {
      setCarrinho(
        (
          carrinhoAtual
        ) =>
          carrinhoAtual.filter(
            (item) =>
              !(
                String(
                  item.id
                ) ===
                  String(id) &&
                item.tamanho ===
                  tamanho
              )
          )
      )
    }

  // =====================================================
  // TOTAIS
  // =====================================================

  const quantidadeTotal =
    carrinho.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.quantidade ||
            0
        ),
      0
    )

  const valorTotal =
    carrinho.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.venda || 0
        ) *
          Number(
            item.quantidade ||
              0
          ),
      0
    )

  const totaisCupom =
    calcularTotaisCupom(
      valorTotal,
      cupomAplicado
    )

  const valorDesconto =
    totaisCupom.desconto

  const totalComDesconto =
    totaisCupom.total

  const cepAtual =
    normalizarCepFrete(
      dadosCliente.cep
    )

  const frete =
    calcularRegraFrete({
      subtotal: valorTotal,
      desconto: valorDesconto,
      uf:
        cepEntregaConfirmado?.cep ===
        cepAtual
          ? cepEntregaConfirmado.estado
          : '',
      cepConfirmado:
        cepEntregaConfirmado?.cep ===
          cepAtual &&
        cepAtual.length === 8
    })

  const totalPedido =
    totalComDesconto +
    (frete.valido
      ? Number(frete.valor || 0)
      : 0)

  const aplicarCupom = () => {
    const resultadoCupom =
      resolverAplicacaoCupom(
        codigoCupom,
        cupomAplicado
      )

    if (
      resultadoCupom.status ===
      'duplicado'
    ) {
      setMensagemCupom({
        tipo: 'erro',
        texto:
          'Este cupom já foi aplicado.'
      })

      return
    }

    if (
      resultadoCupom.status ===
      'invalido'
    ) {
      setMensagemCupom({
        tipo: 'erro',
        texto:
          'Cupom inválido. Verifique o código informado.'
      })

      return
    }

    const cupom =
      resultadoCupom.cupom

    setCupomAplicado(cupom)
    setCodigoCupom(
      cupom.codigo
    )
    setMensagemCupom({
      tipo: 'sucesso',
      texto:
        'Cupom aplicado: 10% de desconto.'
    })
  }

  const removerCupom = () => {
    setCupomAplicado(null)
    setCodigoCupom('')
    setMensagemCupom({
      tipo: 'sucesso',
      texto:
        'Cupom removido.'
    })
  }

  // =====================================================
  // FINALIZAR PEDIDO
  // =====================================================


  const irParaEtapa = (
    etapa
  ) => {
    setErroCheckout('')
    setEtapaCheckout(etapa)
    window.scrollTo(0, 0)
  }

  const abrirCarrinhoCompleto = () => {
    setCarrinhoAberto(false)
    irParaEtapa('carrinho')
  }

  const abrirDetalhesCompra = () => {
    if (carrinho.length === 0) {
      alert(
        'Adicione pelo menos um produto ao carrinho.'
      )

      return
    }

    setDadosCliente(
      (dadosAtuais) => ({
        ...dadosAtuais,
        nome:
          dadosAtuais.nome ||
          nomeCliente.trim()
      })
    )

    irParaEtapa('detalhes')
  }

  const validarCheckout = () => {
    if (carrinho.length === 0) {
      return 'O carrinho está vazio.'
    }

    for (const item of carrinho) {
      const produtoOrig = produtos.find((p) => String(p.id) === String(item.id))
      if (produtoOrig) {
        const tamanhosProd = obterTamanhos(produtoOrig)
        if (tamanhosProd.length > 0) {
          const tamEncontrado = tamanhosProd.find((t) => t.tamanho === item.tamanho)
          if (!tamEncontrado || Number(tamEncontrado.quantidade || 0) <= 0) {
            return `O tamanho "${item.tamanho || 'selecionado'}" para o produto "${produtoOrig.nome}" não está disponível no estoque.`
          }
          if (Number(item.quantidade || 1) > Number(tamEncontrado.quantidade || 0)) {
            return `A quantidade solicitada para o produto "${produtoOrig.nome}" excede o estoque disponível.`
          }
        } else if (Number(item.quantidade || 1) > Number(produtoOrig.quantidade || 0)) {
          return `A quantidade solicitada para o produto "${produtoOrig.nome}" excede o estoque disponível.`
        }
      }
    }

    if (!dadosCliente.nome.trim()) {
      return 'Informe o nome da cliente.'
    }

    if (!dadosCliente.email.trim()) {
      return 'Informe o e-mail da cliente.'
    }

    if (!dadosCliente.telefone.trim()) {
      return 'Informe o telefone ou WhatsApp.'
    }

    if (
      !dadosCliente.cep.trim() ||
      !dadosCliente.endereco.trim() ||
      !dadosCliente.numero.trim() ||
      !dadosCliente.bairro.trim() ||
      !dadosCliente.cidade.trim() ||
      !dadosCliente.estado.trim()
    ) {
      return 'Informe o endereço completo para entrega.'
    }

    if (cepAtual.length !== 8) {
      return 'Informe um CEP válido com 8 dígitos.'
    }

    if (!frete.valido) {
      return frete.status === 'consultar'
        ? 'Consulte o frete para sua região antes de finalizar.'
        : 'Aguarde a confirmação do CEP para calcular o frete.'
    }

    if (!formaPagamento) {
      return 'Selecione uma forma de pagamento.'
    }

    if (!aceitouTermos) {
      return 'Você precisa concordar com os termos e condições.'
    }

    return ''
  }

  const finalizarCheckout = async (
    evento,
    dadosCartao = null
  ) => {
    evento?.preventDefault?.()

    if (finalizandoRef.current) {
      return
    }

    const erroValidacao =
      validarCheckout()

    if (erroValidacao) {
      setErroCheckout(
        erroValidacao
      )

      return
    }

    finalizandoRef.current = true
    setFinalizando(true)
    setErroCheckout('')

    try {
      const nomeCompleto = [
        dadosCliente.nome,
        dadosCliente.sobrenome
      ]
        .map((parte) => parte.trim())
        .filter(Boolean)
        .join(' ')

      const itensAntesDoPedido =
        carrinho.map((item) => {
          const produtoOrig = produtos.find((p) => String(p.id) === String(item.id))
          const tamanhosProd = obterTamanhos(produtoOrig || item)
          const temVariacaoTamanho = tamanhosProd.length > 0
          const tamanhoSanitizado = temVariacaoTamanho
            ? (tamanhosProd.some((t) => t.tamanho === item.tamanho && Number(t.quantidade || 0) > 0) ? item.tamanho : null)
            : null

          return {
            ...item,
            tamanho: tamanhoSanitizado
          }
        })

      if (
        !idempotencyKeyRef.current
      ) {
        idempotencyKeyRef.current =
          crypto.randomUUID()
      }

      const resultado =
        await registrarPagamento({
          email:
            dadosCliente.email,

          cliente: {
            nome:
              nomeCompleto,

            telefone:
              dadosCliente.telefone,

            endereco: {
              cep:
                dadosCliente.cep,

              endereco:
                dadosCliente.endereco,

              numero:
                dadosCliente.numero,

              complemento:
                dadosCliente.complemento,

              bairro:
                dadosCliente.bairro,

              cidade:
                dadosCliente.cidade,

              estado:
                dadosCliente.estado
            }
          },

          itens:
            itensAntesDoPedido,

          cupom:
            cupomAplicado?.codigo ||
            null,

          formaPagamento,

          dadosCartao,

          idempotencyKey:
            idempotencyKeyRef.current
        })

      if (
        !resultado ||
        !resultado.sucesso
      ) {
        idempotencyKeyRef.current = null

        setErroCheckout(
          resultado?.mensagem ||
          'Não foi possível registrar o pedido.'
        )

        return {
          sucesso: false,
          mensagem:
            resultado?.mensagem ||
            'Não foi possível registrar o pedido.'
        }
      }

      if (
        Array.isArray(
          resultado.produtos
        )
      ) {
        setProdutos(
          resultado.produtos
        )
      }

      const itensConfirmacao =
        resultado.pedido.itens.map(
          (itemPedido) => {
            const itemCarrinho =
              itensAntesDoPedido.find(
                (item) =>
                  String(item.id) ===
                    String(
                      itemPedido.produtoId
                    ) &&
                  item.tamanho ===
                    itemPedido.tamanho
              )

            return {
              ...itemPedido,
              foto:
                itemCarrinho?.foto ||
                obterFotos(
                  itemCarrinho || {}
                )[0] ||
                ''
            }
          }
        )

      setPedidoFinalizado({
        ...resultado.pedido,

        nomeCliente:
          resultado.pedido
            .cliente ||
          nomeCompleto,

        itens:
          itensConfirmacao,

        dadosCliente: {
          ...dadosCliente
        },

        formaPagamento,

        pagamento:
          resultado.pagamento ||
          null,

        entrega:
          Number(
            resultado.pedido
              .valor_frete ||
              0
          )
      })

      idempotencyKeyRef.current =
        null
      setCarrinho([])
      irParaEtapa('completo')

      return {
        sucesso: true
      }
    } catch (erro) {
      console.error(
        'Erro ao finalizar checkout:',
        erro
      )

      setErroCheckout(
        'Ocorreu um erro ao finalizar o pedido.'
      )

      return {
        sucesso: false,
        mensagem:
          'Ocorreu um erro ao finalizar o pedido.'
      }
    } finally {
      finalizandoRef.current = false
      setFinalizando(false)
    }
  }

  const abrirWhatsAppPedido = (
    pedido = pedidoFinalizado
  ) => {
    const numeroWhatsApp =
      '5521978889491'

    const mensagem = pedido
      ? [
          `Olá! Gostaria de falar sobre o pedido ${pedido.numero}.`,
          `Cliente: ${pedido.nomeCliente || pedido.cliente}`,
          `Total: ${formatarPreco(pedido.total)}`
        ].join('\n')
      : 'Olá! Gostaria de tirar uma dúvida sobre a loja.'

    window.open(
      'https://wa.me/' +
        numeroWhatsApp +
        '?text=' +
        encodeURIComponent(
          mensagem
        ),
      '_blank'
    )
  }

  const voltarParaLoja = () => {
    idempotencyKeyRef.current =
      null
    setCarrinhoAberto(false)
    setPedidoFinalizado(null)
    setNomeCliente('')
    setDadosCliente(
      DADOS_CLIENTE_INICIAIS
    )
    setFormaPagamento('')
    setAceitouTermos(false)
    setSalvarDados(false)
    setCodigoCupom('')
    setCupomAplicado(null)
    setMensagemCupom(null)
    setCepEntregaConfirmado(null)
    irParaEtapa('loja')
  }

  const usuarioCliente =
    sessaoCliente?.user || null

  const nomePerfil =
    usuarioCliente?.user_metadata
      ?.nome ||
    usuarioCliente?.email
      ?.split('@')[0] ||
    'Entrar'

  const modalCliente = (
    <ClienteAuth
      aberto={perfilAberto}
      sessao={sessaoCliente}
      carregandoSessao={
        carregandoSessao
      }
      recuperacaoSenhaAtiva={
        recuperacaoSenhaAtiva
      }
      onRecuperacaoConcluida={() =>
        setRecuperacaoSenhaAtiva(
          false
        )
      }
      onFechar={() =>
        setPerfilAberto(false)
      }
    />
  )

  // =====================================================
  // TELAS DO CHECKOUT
  // =====================================================

  if (
    etapaCheckout ===
    'carrinho'
  ) {
    return (
      <>
        <Carrinho
          itens={carrinho}
          subtotal={valorTotal}
          desconto={valorDesconto}
          total={totalPedido}
          frete={frete}
          cep={dadosCliente.cep}
          codigoCupom={codigoCupom}
          cupomAplicado={cupomAplicado}
          mensagemCupom={mensagemCupom}
          onCodigoCupomChange={
            setCodigoCupom
          }
          onAplicarCupom={
            aplicarCupom
          }
          onRemoverCupom={
            removerCupom
          }
          onCepChange={(cep) =>
            setDadosCliente(
              (dadosAtuais) => ({
                ...dadosAtuais,
                cep
              })
            )
          }
          onCepResolvido={
            setCepEntregaConfirmado
          }
          onVoltar={() =>
            irParaEtapa('loja')
          }
          onContinuar={
            abrirDetalhesCompra
          }
          onAumentar={
            aumentarQuantidade
          }
          onDiminuir={
            diminuirQuantidade
          }
          onRemover={
            removerProduto
          }
        />
        {modalCliente}
      </>
    )
  }

  if (
    etapaCheckout ===
    'detalhes'
  ) {
    return (
      <>
        <Checkout
          itens={carrinho}
          subtotal={valorTotal}
          desconto={valorDesconto}
          total={totalPedido}
          frete={frete}
          cupomAplicado={cupomAplicado}
          dados={dadosCliente}
          onDadosChange={
            setDadosCliente
          }
          onCepResolvido={
            setCepEntregaConfirmado
          }
          salvarDados={salvarDados}
          onSalvarDadosChange={
            setSalvarDados
          }
          formaPagamento={
            formaPagamento
          }
          onFormaPagamentoChange={
            setFormaPagamento
          }
          aceitouTermos={
            aceitouTermos
          }
          onAceitouTermosChange={
            setAceitouTermos
          }
          usuario={usuarioCliente}
          onEntrar={() =>
            setPerfilAberto(true)
          }
          erro={erroCheckout}
          finalizando={finalizando}
          onVoltar={() =>
            irParaEtapa('carrinho')
          }
          onFinalizar={
            finalizarCheckout
          }
        />
        {modalCliente}
      </>
    )
  }

  if (
    etapaCheckout ===
      'completo' &&
    pedidoFinalizado
  ) {
    return (
      <>
        <PedidoCompleto
          pedido={
            pedidoFinalizado
          }
          onVoltarLoja={
            voltarParaLoja
          }
          onWhatsApp={() =>
            abrirWhatsAppPedido(
              pedidoFinalizado
            )
          }
        />
        {modalCliente}
      </>
    )
  }

  // =====================================================
  // RENDER DA LOJA
  // =====================================================

  return (
    <>
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
            <span>Bazar</span>
            <strong>Encanto Feminino</strong>
          </div>
        </div>

        <nav className="loja-nav-desktop">
          <button className="loja-nav-link" type="button" onClick={() => (onNavegar ? onNavegar('/') : (window.location.href = '/'))}>Início</button>
          <button className="loja-nav-link" type="button" onClick={() => (onNavegar ? onNavegar('/#produtos') : (window.location.href = '/#produtos'))}>Coleção</button>
          <button className="loja-nav-link" type="button" onClick={() => (onNavegar ? onNavegar('/acompanhar-pedido') : (window.location.href = '/acompanhar-pedido'))}>Acompanhar Pedido</button>
          <button className="loja-nav-link" type="button" onClick={() => (onNavegar ? onNavegar('/sobre') : (window.location.href = '/sobre'))}>Sobre</button>
        </nav>

        <div className="loja-header-actions">

          <button
            className="loja-header-action"
            type="button"
            onClick={() =>
              abrirWhatsAppPedido()
            }
            aria-label="Falar no WhatsApp"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5Z" />
              <path d="M8.5 8.2c.6 3 2.3 4.7 5.3 5.3" />
            </svg>
            <span>WhatsApp</span>
          </button>

          <div className="loja-profile-wrapper">
            <button
              className="loja-header-action"
              type="button"
              onClick={() =>
                setPerfilAberto(
                  (aberto) =>
                    !aberto
                )
              }
              aria-expanded={
                perfilAberto
              }
              aria-label="Perfil e conta"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6" />
              </svg>
              <span>{nomePerfil}</span>
            </button>

          </div>

          <button
            className="loja-cart-button"
            type="button"
            onClick={() =>
              setCarrinhoAberto(
                true
              )
            }
            aria-label={
              `Abrir carrinho com ${quantidadeTotal} item(ns), total ${formatarPreco(totalPedido)}`
            }
          >
            <span className="loja-cart-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 4h2l2.2 10h9.7l2-7H6" />
                <circle cx="9" cy="19" r="1.3" />
                <circle cx="17" cy="19" r="1.3" />
              </svg>
            </span>

            <span className="loja-cart-text">
              <span>Carrinho</span>
              <strong>
                {formatarPreco(
                  totalPedido
                )}
              </strong>
            </span>

            <strong className="loja-cart-count">
              {quantidadeTotal}
            </strong>
          </button>

        </div>

      </header>

      <div className="loja-shipping-banner">
        <strong>
          FRETE GRÁTIS PARA TODO O BRASIL EM COMPRAS A PARTIR DE R$ 400
        </strong>
        <span>Sul e Sudeste: R$ 19,90</span>
      </div>


      {/* ================================================= */}
      {/* BARRA DE BENEFÍCIOS                               */}
      {/* ================================================= */}

      <div className="loja-beneficios-bar">
        <div className="loja-beneficios-grid">
          <div className="beneficio-item">
            <span className="beneficio-icone">🔒</span>
            <span>Compra 100% Segura</span>
          </div>
          <div className="beneficio-item">
            <span className="beneficio-icone">💳</span>
            <span>Pix ou Cartão de Crédito</span>
          </div>
          <div className="beneficio-item">
            <span className="beneficio-icone">📦</span>
            <span>Acompanhe seu Pedido</span>
          </div>
          <div className="beneficio-item">
            <span className="beneficio-icone">🚚</span>
            <span>Entrega Garantida</span>
          </div>
        </div>
      </div>

      {/* ================================================= */}
      {/* HERO                                              */}
      {/* ================================================= */}

      <section className="loja-hero">
        <div className="loja-hero-content">
          <span className="loja-hero-eyebrow">BAZAR ENCANTO FEMININO</span>
          <h1>Moda que encanta.</h1>
          <p>Encontre peças especiais para deixar seu look ainda mais bonito.</p>
        </div>
        <div className="loja-hero-decoration">✿</div>
      </section>

      {/* ================================================= */}
      {/* CATEGORIAS                                        */}
      {/* ================================================= */}

      <section className="loja-categorias" id="produtos">
        {categorias.map((categoria) => (
          <button
            key={categoria}
            type="button"
            className={
              'categoria-button ' +
              (categoriaAtiva === categoria ? 'active' : '')
            }
            onClick={() => setCategoriaAtiva(categoria)}
          >
            {categoria}
          </button>
        ))}
      </section>

      {/* ================================================= */}
      {/* CONTEÚDO                                          */}
      {/* ================================================= */}

      <main className="loja-conteudo">

        <div className="loja-busca-ordenacao">
          <div className="loja-busca-input-wrap">
            <span className="loja-busca-icone">🔍</span>
            <input
              type="text"
              className="loja-busca-input"
              placeholder="Buscar por nome, categoria ou código..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar produtos"
            />
          </div>
          <select
            className="loja-ordenacao-select"
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value)}
            aria-label="Ordenar produtos"
          >
            <option value="novidades">Novidades Primeiro</option>
            <option value="menor-preco">Menor Preço</option>
            <option value="maior-preco">Maior Preço</option>
            <option value="nome">Nome (A-Z)</option>
          </select>
        </div>

        <div className="loja-section-header">
          <div>
            <span>NOSSA SELEÇÃO</span>
            <h2>Produtos em destaque</h2>
          </div>
          <p>Escolha suas peças favoritas</p>
        </div>

        {carregandoProdutos ? (

          <div className="loja-sem-produtos">

            <div>
              ✿
            </div>

            <strong>
              Carregando produtos...
            </strong>

            <span>
              Aguarde enquanto buscamos
              nossa seleção.
            </span>

          </div>

        ) : produtosDisponiveis.length ===
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
              (produto) => {
                const fotos =
                  obterFotos(
                    produto
                  )

                const indiceFoto =
                  obterIndiceFoto(
                    produto
                  )

                const tamanhos =
                  obterTamanhos(
                    produto
                  )

                return (
                  <article
                    className="loja-produto-card"
                    key={
                      produto.id
                    }
                  >

                    {/* =================================================
                        FOTOS / CARROSSEL
                    ================================================= */}

                    <div className="loja-produto-foto">

                      {fotos.length >
                      0 ? (

                        <>

                          <button
                            type="button"
                            className="loja-foto-zoom"
                            onClick={(evento) =>
                              abrirLightbox(
                                produto,
                                indiceFoto,
                                evento
                              )
                            }
                            aria-label={`Ampliar foto de ${produto.nome}`}
                          >
                            <img
                              src={
                                fotos[
                                  indiceFoto
                                ]
                              }
                              alt={
                                produto.nome
                              }
                            />
                          </button>

                        </>

                      ) : (

                        <div className="loja-foto-placeholder">
                          ✿
                        </div>

                      )}

                      <span className="loja-produto-categoria">
                        {
                          produto.categoria ||
                          'Produto'
                        }
                      </span>

                    </div>

                    {fotos.length >
                      1 && (
                      <div className="loja-foto-controls">

                        <button
                          type="button"
                          className="loja-foto-prev"
                          onClick={() =>
                            mudarFoto(
                              produto,
                              -1
                            )
                          }
                          aria-label="Foto anterior"
                        >
                          ‹
                        </button>

                        <div className="loja-foto-indicators">

                          {fotos.map(
                            (
                              _,
                              indice
                            ) => (
                              <button
                                type="button"
                                key={
                                  indice
                                }
                                className={
                                  indice ===
                                  indiceFoto
                                    ? 'active'
                                    : ''
                                }
                                onClick={() =>
                                  setFotoAtiva(
                                    (
                                      atual
                                    ) => ({
                                      ...atual,

                                      [produto.id]:
                                        indice
                                    })
                                  )
                                }
                                aria-label={
                                  'Ver foto ' +
                                  (
                                    indice +
                                    1
                                  )
                                }
                              />
                            )
                          )}

                        </div>

                        <button
                          type="button"
                          className="loja-foto-next"
                          onClick={() =>
                            mudarFoto(
                              produto,
                              1
                            )
                          }
                          aria-label="Próxima foto"
                        >
                          ›
                        </button>

                      </div>
                    )}

                    {/* =================================================
                        INFORMAÇÕES
                    ================================================= */}

                    <div className="loja-produto-info">

                      <h3>
                        {
                          produto.nome
                        }
                      </h3>

                      {produto.marca && (
                        <span className="loja-produto-marca">
                          {
                            produto.marca
                          }
                        </span>
                      )}

                      {/* COR REMOVIDA DA LOJA */}

                      {/* =================================================
                          TAMANHOS
                      ================================================= */}

                      {tamanhos.length >
                        0 && (
                        <div className="loja-tamanhos">

                          {tamanhos.map(
                            (
                              item
                            ) => {
                              const indisponivel =
                                Number(
                                  item.quantidade ||
                                    0
                                ) <= 0

                              const selecionado =
                                tamanhoSelecionado[
                                  produto.id
                                ] ===
                                item.tamanho

                              return (
                                <button
                                  key={
                                    item.tamanho
                                  }
                                  type="button"
                                  className={
                                    'loja-tamanho' +
                                    (
                                      selecionado
                                        ? ' active'
                                        : ''
                                    ) +
                                    (
                                      indisponivel
                                        ? ' disabled'
                                        : ''
                                    )
                                  }
                                  disabled={
                                    indisponivel
                                  }
                                  onClick={() =>
                                    selecionarTamanho(
                                      produto.id,
                                      item.tamanho
                                    )
                                  }
                                  title={
                                    indisponivel
                                      ? 'Tamanho sem estoque'
                                      : item.quantidade +
                                        ' unidade(s)'
                                  }
                                  aria-pressed={
                                    selecionado
                                  }
                                >
                                  {
                                    item.tamanho
                                  }
                                </button>
                              )
                            }
                          )}

                        </div>
                      )}

                      <div className="loja-produto-bottom">

                        <strong>
                          {
                            formatarPreco(
                              produto.venda
                            )
                          }
                        </strong>

                        <div className="loja-produto-actions">
                          <button
                            type="button"
                            className="loja-produto-add"
                            onClick={() =>
                              adicionarCarrinho(
                                produto
                              )
                            }
                            aria-label={`Adicionar ${produto.nome} e abrir o carrinho`}
                          >
                            +
                          </button>

                          <button
                            type="button"
                            className="loja-produto-cart-add"
                            onClick={() =>
                              adicionarCarrinho(
                                produto,
                                false
                              )
                            }
                            aria-label={`Adicionar ${produto.nome} ao carrinho`}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M3 4h2l2.2 10h9.7l2-7H6" />
                              <circle cx="9" cy="19" r="1.3" />
                              <circle cx="17" cy="19" r="1.3" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            className="loja-produto-detalhes"
                            onClick={() =>
                              setDetalheProdutoModal(
                                produto
                              )
                            }
                            aria-label={`Ver detalhes de ${produto.nome}`}
                          >
                            Ver detalhes
                          </button>
                        </div>

                      </div>

                      {String(
                        feedbackProduto?.produtoId
                      ) === String(produto.id) && (
                        <p
                          className={`loja-produto-feedback ${feedbackProduto.tipo}`}
                          role="status"
                          aria-live="polite"
                        >
                          {feedbackProduto.mensagem}
                        </p>
                      )}

                    </div>

                  </article>
                )
              }
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
          onClick={(
            evento
          ) => {

            if (
              evento.target ===
              evento.currentTarget
            ) {
              setCarrinhoAberto(
                false
              )
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

              <div className="loja-cart-header-actions">

                <button
                  type="button"
                  className="loja-continue-shopping-top"
                  onClick={() =>
                    setCarrinhoAberto(
                      false
                    )
                  }
                >
                  <span aria-hidden="true">
                    ←
                  </span>

                  Continuar comprando
                </button>

                <button
                  type="button"
                  className="loja-cart-close"
                  onClick={() =>
                    setCarrinhoAberto(
                      false
                    )
                  }
                  aria-label="Fechar carrinho"
                >
                  ×
                </button>

              </div>

            </div>

            {carrinho.length ===
            0 ? (

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
                        key={
                          String(
                            item.id
                          ) +
                          '-' +
                          item.tamanho
                        }
                      >

                        <div className="loja-cart-item-image">

                          {item.foto ? (

                            <img
                              src={
                                item.foto
                              }
                              alt={
                                item.nome
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
                            {
                              item.nome
                            }
                          </strong>

                          {item.tamanho && (
                            <span>
                              Tamanho{' '}
                              {
                                item.tamanho
                              }
                            </span>
                          )}

                          <small>
                            {
                              formatarPreco(
                                item.venda
                              )
                            }
                          </small>

                          <div className="loja-quantity">

                            <button
                              type="button"
                              onClick={() =>
                                diminuirQuantidade(
                                  item.id,
                                  item.tamanho
                                )
                              }
                            >
                              −
                            </button>

                            <span>
                              {
                                item.quantidade
                              }
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                aumentarQuantidade(
                                  item.id,
                                  item.tamanho
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
                              item.id,
                              item.tamanho
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
                      value={
                        nomeCliente
                      }
                      onChange={(
                        evento
                      ) =>
                        setNomeCliente(
                          evento.target
                            .value
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
                      {
                        formatarPreco(
                          totalComDesconto
                        )
                      }
                    </strong>

                  </div>

                  <button
                    className="loja-whatsapp-button"
                    type="button"
                    onClick={
                      abrirCarrinhoCompleto
                    }
                  >

                    <span>
                      →
                    </span>

                    <strong>
                      Continuar para finalização
                    </strong>

                  </button>

                  <button
                    className="loja-whatsapp-link"
                    type="button"
                    onClick={() =>
                      abrirWhatsAppPedido()
                    }
                  >
                    Falar no WhatsApp
                  </button>

                  <p className="loja-cart-note">
                    Revise o carrinho e preencha
                    os dados de entrega na próxima etapa.
                  </p>

                </div>

              </>

            )}

          </aside>

        </div>

      )}

      {lightbox && (
        <div
          className="loja-lightbox-overlay"
          onMouseDown={(evento) => {
            if (
              evento.target ===
              evento.currentTarget
            ) {
              fecharLightbox()
            }
          }}
        >
          <section
            className="loja-lightbox"
            ref={lightboxDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Fotos ampliadas de ${lightbox.nome}`}
          >
            <button
              type="button"
              className="loja-lightbox-close"
              onClick={fecharLightbox}
              aria-label="Fechar fotos ampliadas"
            >
              ×
            </button>

            <div
              className="loja-lightbox-stage"
              onMouseDown={(evento) => {
                if (
                  evento.target ===
                  evento.currentTarget
                ) {
                  fecharLightbox()
                }
              }}
            >
              {lightbox.fotos.length > 1 && (
                <button
                  type="button"
                  className="loja-lightbox-arrow previous"
                  onClick={() =>
                    navegarLightbox(-1)
                  }
                  aria-label="Foto anterior"
                >
                  ‹
                </button>
              )}

              <img
                src={
                  lightbox.fotos[
                    lightbox.indice
                  ]
                }
                alt={`${lightbox.nome}, foto ${lightbox.indice + 1} de ${lightbox.fotos.length}`}
              />

              {lightbox.fotos.length > 1 && (
                <button
                  type="button"
                  className="loja-lightbox-arrow next"
                  onClick={() =>
                    navegarLightbox(1)
                  }
                  aria-label="Próxima foto"
                >
                  ›
                </button>
              )}
            </div>

            <div className="loja-lightbox-footer">
              <span aria-live="polite">
                {lightbox.indice + 1} de {lightbox.fotos.length}
              </span>

              {lightbox.fotos.length > 1 && (
                <div className="loja-lightbox-thumbnails">
                  {lightbox.fotos.map(
                    (foto, indice) => (
                      <button
                        type="button"
                        key={`${lightbox.produtoId}-${indice}`}
                        className={
                          indice === lightbox.indice
                            ? 'active'
                            : ''
                        }
                        onClick={() =>
                          setLightbox(
                            (atual) => ({
                              ...atual,
                              indice
                            })
                          )
                        }
                        aria-label={`Ver foto ${indice + 1}`}
                        aria-current={
                          indice === lightbox.indice
                            ? 'true'
                            : undefined
                        }
                      >
                        <img
                          src={foto}
                          alt=""
                        />
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* =================================================
          MODAL DETALHE DO PRODUTO
      ================================================= */}

      {detalheProdutoModal && (() => {
        const prod = detalheProdutoModal;
        const fotosProd = obterFotos(prod);
        const indiceProd = obterIndiceFoto(prod);
        const tamProd = obterTamanhos(prod);
        return (
          <div
            className="loja-detalhe-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) setDetalheProdutoModal(null); }}
            role="dialog"
            aria-modal="true"
            aria-label={`Detalhes de ${prod.nome}`}
          >
            <div className="loja-detalhe-modal">
              <button
                type="button"
                className="loja-detalhe-fechar"
                onClick={() => setDetalheProdutoModal(null)}
                aria-label="Fechar detalhes"
              >
                ✕
              </button>

              <div className="loja-detalhe-foto-area">
                {fotosProd.length > 0 ? (
                  <>
                    <img
                      src={fotosProd[indiceProd]}
                      alt={prod.nome}
                      className="loja-detalhe-foto-principal"
                    />
                    {fotosProd.length > 1 && (
                      <div className="loja-detalhe-thumbs">
                        {fotosProd.map((foto, idx) => (
                          <button
                            type="button"
                            key={idx}
                            className={'loja-detalhe-thumb' + (idx === indiceProd ? ' active' : '')}
                            onClick={() =>
                              setFotoAtiva((atual) => ({
                                ...atual,
                                [prod.id]: idx
                              }))
                            }
                          >
                            <img src={foto} alt={`${prod.nome} foto ${idx + 1}`} />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="loja-foto-placeholder">✿</div>
                )}
              </div>

              <div className="loja-detalhe-info">
                <span className="loja-detalhe-categoria">{prod.categoria || 'Produto'}</span>
                <h2 className="loja-detalhe-nome">{prod.nome}</h2>
                {prod.marca && <span className="loja-detalhe-marca">{prod.marca}</span>}
                <strong className="loja-detalhe-preco">{formatarPreco(prod.venda)}</strong>
                {prod.descricao && <p className="loja-detalhe-desc">{prod.descricao}</p>}

                {tamProd.length > 0 && (
                  <div className="loja-detalhe-tamanhos">
                    <span>Tamanhos disponíveis:</span>
                    <div className="loja-tamanhos">
                      {tamProd.map((item) => {
                        const indisponivel = Number(item.quantidade || 0) <= 0;
                        const selecionado = tamanhoSelecionado[prod.id] === item.tamanho;
                        return (
                          <button
                            key={item.tamanho}
                            type="button"
                            className={
                              'loja-tamanho' +
                              (selecionado ? ' active' : '') +
                              (indisponivel ? ' disabled' : '')
                            }
                            disabled={indisponivel}
                            onClick={() => selecionarTamanho(prod.id, item.tamanho)}
                            title={indisponivel ? 'Tamanho sem estoque' : item.quantidade + ' unidade(s)'}
                            aria-pressed={selecionado}
                          >
                            {item.tamanho}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="loja-detalhe-acoes">
                  <button
                    type="button"
                    className="loja-detalhe-comprar"
                    onClick={() => {
                      adicionarCarrinho(prod);
                      setDetalheProdutoModal(null);
                    }}
                  >
                    Adicionar ao Carrinho
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =================================================
          FOOTER
      ================================================= */}

      <Footer onNavegar={onNavegar} />

      </div>
      {modalCliente}
    </>
  )
}

export default Loja
