const STATUS_PAGAMENTO = {
  aprovado: {
    titulo: 'Pagamento confirmado',
    resumo: 'Pago',
    mensagemAtualizacao: 'Pagamento confirmado.',
    aprovado: true,
    pendente: false,
  },
  pendente: {
    titulo: 'Aguardando pagamento',
    resumo: 'Aguardando',
    mensagemAtualizacao: 'Pagamento ainda aguardando confirmação.',
    aprovado: false,
    pendente: true,
  },
  recusado: {
    titulo: 'Pagamento não aprovado',
    resumo: 'Recusado',
    mensagemAtualizacao: 'Pagamento não aprovado.',
    aprovado: false,
    pendente: false,
  },
  cancelado: {
    titulo: 'Pagamento não aprovado',
    resumo: 'Cancelado',
    mensagemAtualizacao: 'Pagamento cancelado.',
    aprovado: false,
    pendente: false,
  },
  expirado: {
    titulo: 'Pagamento expirado',
    resumo: 'Expirado',
    mensagemAtualizacao: 'O prazo para pagamento expirou.',
    aprovado: false,
    pendente: false,
  },
  reembolsado: {
    titulo: 'Pagamento reembolsado',
    resumo: 'Reembolsado',
    mensagemAtualizacao: 'Pagamento reembolsado.',
    aprovado: false,
    pendente: false,
  },
}
const STATUS_NAO_INFORMADO = {
  titulo: 'Status do pagamento não informado',
  resumo: 'Status não informado',
  mensagemAtualizacao: 'Status do pagamento não informado.',
  aprovado: false,
  pendente: false,
}

export function obterStatusPagamento(valor) {
  const status = typeof valor === 'string'
    ? valor.trim().toLowerCase()
    : ''

  if (['aprovado', 'approved', 'pago', 'paga', 'confirmado', 'confirmada', 'paid'].includes(status)) {
    return {
      status,
      ...STATUS_PAGAMENTO.aprovado,
    }
  }

  if (['pendente', 'pending', 'in_process', 'action_required', 'aguardando', 'aguardando pagamento'].includes(status)) {
    return {
      status,
      ...STATUS_PAGAMENTO.pendente,
    }
  }

  if (['recusado', 'rejected', 'rejeitado', 'rejeitada', 'denied', 'declined'].includes(status)) {
    return {
      status,
      ...STATUS_PAGAMENTO.recusado,
    }
  }

  if (['cancelado', 'cancelled', 'canceled'].includes(status)) {
    return {
      status,
      ...STATUS_PAGAMENTO.cancelado,
    }
  }

  if (['expirado', 'expired'].includes(status)) {
    return {
      status,
      ...STATUS_PAGAMENTO.expirado,
    }
  }

  if (['reembolsado', 'refunded'].includes(status)) {
    return {
      status,
      ...STATUS_PAGAMENTO.reembolsado,
    }
  }

  return {
    status,
    ...(STATUS_PAGAMENTO[status] || STATUS_NAO_INFORMADO),
  }
}

export function obterStatusPedido(valor) {
  if (typeof valor !== 'string' || !valor.trim()) {
    return 'Status não informado'
  }

  const status = valor.trim().toLowerCase()

  if (status === 'novo') return 'Confirmado'
  if (status === 'aguardando pagamento') return 'Aguardando pagamento'
  if (status === 'confirmado' || status === 'confirmada') return 'Confirmado'
  if (status === 'em preparação' || status === 'em preparacao') {
    return 'Em preparação'
  }
  if (status === 'enviado') return 'Enviado'
  if (status === 'entregue') return 'Entregue'
  if (status === 'concluído' || status === 'concluido') return 'Concluído'
  if (status === 'cancelado') return 'Cancelado'

  return 'Status não informado'
}

export const FLUXO_PEDIDO = [
  'Aguardando pagamento',
  'Confirmado',
  'Em preparação',
  'Enviado',
  'Entregue',
  'Concluído'
]

const TRANSICOES_PEDIDO = {
  'Aguardando pagamento': ['Confirmado', 'Cancelado'],
  Confirmado: ['Em preparação', 'Cancelado'],
  'Em preparação': ['Enviado', 'Cancelado'],
  Enviado: ['Entregue'],
  Entregue: ['Concluído'],
  Concluído: [],
  Cancelado: []
}

export function obterTransicoesPedido(valor) {
  return TRANSICOES_PEDIDO[obterStatusPedido(valor)] || []
}

export function montarTimelinePedido(statusPedido, statusPagamento) {
  const status = obterStatusPedido(statusPedido)
  const pagamento = obterStatusPagamento(statusPagamento)

  if (status === 'Cancelado') {
    return [{ titulo: 'Pedido cancelado', estado: 'cancelado' }]
  }

  if (pagamento.status && !pagamento.aprovado) {
    return [{
      titulo: pagamento.pendente ? 'Aguardando pagamento' : pagamento.titulo,
      estado: pagamento.pendente ? 'atual' : 'cancelado'
    }]
  }

  if (!pagamento.status) {
    return [{ titulo: pagamento.titulo, estado: 'neutro' }]
  }

  const indice = FLUXO_PEDIDO.indexOf(status)
  return [
    { titulo: 'Pagamento aprovado', estado: 'concluido' },
    ...FLUXO_PEDIDO.slice(1).map((titulo, itemIndice) => {
      const etapaIndex = itemIndice + 1
      return {
        titulo,
        estado: etapaIndex <= indice
          ? (etapaIndex === indice ? 'atual' : 'concluido')
          : 'futuro'
      }
    })
  ]
}

export function ehPedidoDeTeste(pedido) {
  if (!pedido || typeof pedido !== 'object') return false

  const email = String(pedido.email_cliente || pedido.email || '').trim().toLowerCase()
  const nome = String(pedido.cliente || pedido.nomeCliente || pedido.nome || '').trim().toLowerCase()
  const extRef = String(pedido.external_reference || '').trim().toLowerCase()
  const paymentId = String(pedido.payment_id || '').trim().toLowerCase()

  if (
    email.endsWith('@example.com') ||
    email.includes('@teste.com') ||
    email.includes('teste@') ||
    email.includes('testador@') ||
    email.includes('sandbox_') ||
    email.includes('test_user')
  ) {
    return true
  }

  if (
    nome.includes('testador') ||
    nome.includes('comprador teste') ||
    nome === 'teste' ||
    nome === 'usuario teste' ||
    nome.includes('sandbox')
  ) {
    return true
  }

  if (
    extRef.includes('diag_') ||
    extRef.includes('test_') ||
    extRef.includes('sandbox_') ||
    extRef.includes('mock_') ||
    extRef.startsWith('teste-')
  ) {
    return true
  }

  if (
    paymentId.startsWith('mock_') ||
    paymentId.startsWith('test_') ||
    paymentId === 'sandbox'
  ) {
    return true
  }

  return false
}

