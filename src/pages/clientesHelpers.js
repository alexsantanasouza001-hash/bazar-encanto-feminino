export function normalizarTextoBusca(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function formatarTelefone(valor) {
  const digits = String(valor || '').replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return valor || 'Não informado'
}

export function formatarCpfOfuscado(valor) {
  const digits = String(valor || '').replace(/\D/g, '')
  if (digits.length === 11) {
    return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
  }
  return valor ? '***.***.***-**' : 'Não informado'
}

export function extrairEnderecoCliente(pedido) {
  const partes = [
    pedido.endereco_entrega,
    pedido.numero_entrega ? `nº ${pedido.numero_entrega}` : '',
    pedido.complemento_entrega,
    pedido.bairro_entrega,
    pedido.cidade_entrega && pedido.estado_entrega
      ? `${pedido.cidade_entrega} - ${pedido.estado_entrega}`
      : pedido.cidade_entrega || pedido.estado_entrega || '',
    pedido.cep_entrega ? `CEP: ${pedido.cep_entrega}` : ''
  ].filter(Boolean)

  return partes.length > 0 ? partes.join(', ') : 'Endereço não informado'
}

export function ePedidoPagoValido(pedido) {
  if (!pedido) return false
  if (pedido.status === 'Cancelado') return false
  if (pedido.status_pagamento === 'aprovado') return true
  const statusConhecido = String(pedido.status || '').toLowerCase()
  return [
    'confirmado',
    'em preparação',
    'em preparacao',
    'enviado',
    'entregue',
    'concluído',
    'concluido'
  ].includes(statusConhecido)
}

export function agruparClientesDosPedidos(pedidos = []) {
  if (!Array.isArray(pedidos)) return []

  const clientesMap = new Map()
  const DIAS_INATIVO = 90
  const agora = Date.now()

  const pedidosOrdenados = [...pedidos].sort((a, b) => {
    const dataA = new Date(a.data || a.dataPedido || a.createdAt || 0).getTime()
    const dataB = new Date(b.data || b.dataPedido || b.createdAt || 0).getTime()
    return dataA - dataB
  })

  for (const pedido of pedidosOrdenados) {
    const userId = pedido.user_id || null
    const email = String(pedido.email_cliente || pedido.email || '').trim().toLowerCase()
    const nome = String(pedido.cliente || pedido.nomeCliente || pedido.nome || '').trim()

    let chave = ''
    if (userId) {
      chave = `user:${userId}`
    } else if (email) {
      chave = `email:${email}`
    } else if (nome) {
      chave = `nome:${nome.toLowerCase()}`
    } else {
      chave = `pedido:${pedido.id || pedido.numero || Math.random()}`
    }

    const dataPedido = pedido.data || pedido.dataPedido || pedido.createdAt || new Date().toISOString()
    const valorPedido = Number(pedido.total || pedido.valorTotal || 0)
    const telefone = pedido.telefone_cliente || pedido.telefone || ''
    const cpf = pedido.cpf_cliente || pedido.cpf || ''

    if (!clientesMap.has(chave)) {
      clientesMap.set(chave, {
        id: chave,
        userId,
        nome: nome || 'Cliente sem nome',
        email: email || 'Não informado',
        telefone: telefone || '',
        cpf: cpf || '',
        ultimoEndereco: extrairEnderecoCliente(pedido),
        cidade: pedido.cidade_entrega || '',
        estado: pedido.estado_entrega || '',
        pedidos: [],
        pedidosValidos: [],
        primeiraCompra: dataPedido,
        ultimaCompra: dataPedido,
        totalGasto: 0,
        ticketMedio: 0,
        status: 'Novo'
      })
    }

    const cliente = clientesMap.get(chave)

    if (nome) cliente.nome = nome
    if (email && email !== 'não informado') cliente.email = email
    if (telefone) cliente.telefone = telefone
    if (cpf) cliente.cpf = cpf
    if (pedido.cep_entrega || pedido.endereco_entrega) {
      cliente.ultimoEndereco = extrairEnderecoCliente(pedido)
      cliente.cidade = pedido.cidade_entrega || cliente.cidade
      cliente.estado = pedido.estado_entrega || cliente.estado
    }

    cliente.ultimaCompra = dataPedido
    cliente.pedidos.push(pedido)

    if (ePedidoPagoValido(pedido)) {
      cliente.pedidosValidos.push(pedido)
      cliente.totalGasto += valorPedido
    }
  }

  const listaClientes = Array.from(clientesMap.values()).map((cliente) => {
    const qtdValidos = cliente.pedidosValidos.length
    cliente.ticketMedio = qtdValidos > 0 ? cliente.totalGasto / qtdValidos : 0

    cliente.pedidos.sort((a, b) => {
      const dataA = new Date(a.data || a.dataPedido || a.createdAt || 0).getTime()
      const dataB = new Date(b.data || b.dataPedido || b.createdAt || 0).getTime()
      return dataB - dataA
    })

    const dataUltima = new Date(cliente.ultimaCompra).getTime()
    const diasDesdeUltimaCompra = Number.isNaN(dataUltima)
      ? 0
      : (agora - dataUltima) / (1000 * 60 * 60 * 24)

    if (qtdValidos >= 2) {
      cliente.status = 'Recorrente'
    } else if (diasDesdeUltimaCompra > DIAS_INATIVO && qtdValidos > 0) {
      cliente.status = 'Inativo'
    } else {
      cliente.status = 'Novo'
    }

    return cliente
  })

  return listaClientes
}

export function filtrarEOrdenarClientes(
  clientes = [],
  { busca = '', filtroStatus = 'todos', ordenacao = 'recente' } = {}
) {
  if (!Array.isArray(clientes)) return []

  const termoBusca = normalizarTextoBusca(busca)

  return clientes
    .filter((cliente) => {
      if (termoBusca) {
        const nomeNorm = normalizarTextoBusca(cliente.nome)
        const emailNorm = normalizarTextoBusca(cliente.email)
        const telNorm = normalizarTextoBusca(cliente.telefone)
        const cidadeNorm = normalizarTextoBusca(cliente.cidade)
        const estadoNorm = normalizarTextoBusca(cliente.estado)

        const bateu =
          nomeNorm.includes(termoBusca) ||
          emailNorm.includes(termoBusca) ||
          telNorm.includes(termoBusca) ||
          cidadeNorm.includes(termoBusca) ||
          estadoNorm.includes(termoBusca)

        if (!bateu) return false
      }

      if (filtroStatus !== 'todos') {
        if (filtroStatus === 'novos' && cliente.status !== 'Novo') return false
        if (filtroStatus === 'recorrentes' && cliente.status !== 'Recorrente') return false
        if (filtroStatus === 'inativos' && cliente.status !== 'Inativo') return false
      }

      return true
    })
    .sort((a, b) => {
      if (ordenacao === 'maior-valor') {
        return b.totalGasto - a.totalGasto
      }
      if (ordenacao === 'mais-pedidos') {
        return b.pedidos.length - a.pedidos.length
      }
      if (ordenacao === 'nome') {
        return a.nome.localeCompare(b.nome)
      }
      const dataA = new Date(a.ultimaCompra).getTime() || 0
      const dataB = new Date(b.ultimaCompra).getTime() || 0
      return dataB - dataA
    })
}
