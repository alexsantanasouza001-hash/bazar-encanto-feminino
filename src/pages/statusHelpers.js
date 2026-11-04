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
    return 'Pedido recebido'
  }

  const status = valor.trim().toLowerCase()

  if (status === 'pedido recebido' || status === 'recebido') return 'Pedido recebido'
  if (status === 'novo' || status === 'confirmado' || status === 'confirmada') return 'Pedido recebido'
  if (status === 'aguardando pagamento') return 'Aguardando pagamento'
  if (status === 'em preparação' || status === 'em preparacao') return 'Em preparação'
  if (status === 'enviado') return 'Enviado'
  if (status === 'pronto para retirada' || status === 'pronto_retirada' || status === 'pronto') return 'Pronto para retirada'
  if (status === 'entregue') return 'Entregue'
  if (status === 'concluído' || status === 'concluido') return 'Entregue'
  if (status === 'cancelado') return 'Cancelado'

  return 'Pedido recebido'
}

export const FLUXO_PEDIDO_ENTREGA = [
  'Pedido recebido',
  'Em preparação',
  'Enviado',
  'Entregue'
]

export const FLUXO_PEDIDO_RETIRADA = [
  'Pedido recebido',
  'Em preparação',
  'Pronto para retirada',
  'Entregue'
]

export function montarTimelinePedido(statusPedido, statusPagamento, modalidadeEntrega = 'correios') {
  const status = obterStatusPedido(statusPedido)
  const isRetirada = String(modalidadeEntrega || '').toLowerCase().includes('retirada')

  if (status === 'Cancelado') {
    return [{ titulo: 'Pedido cancelado', estado: 'cancelado' }]
  }

  const fluxo = isRetirada ? FLUXO_PEDIDO_RETIRADA : FLUXO_PEDIDO_ENTREGA
  const indice = fluxo.indexOf(status)
  const indexEfetivo = indice >= 0 ? indice : 0

  return fluxo.map((titulo, idx) => {
    let estado = 'futuro'
    if (idx < indexEfetivo) {
      estado = 'concluido'
    } else if (idx === indexEfetivo) {
      estado = 'atual'
    }

    return {
      titulo,
      estado
    }
  })
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

