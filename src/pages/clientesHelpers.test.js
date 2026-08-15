import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agruparClientesDosPedidos,
  filtrarEOrdenarClientes,
  formatarCpfOfuscado,
  formatarTelefone
} from './clientesHelpers.js'

test('agrupa pedidos do mesmo user_id em um unico cliente', () => {
  const pedidos = [
    {
      id: 1,
      user_id: 'usr-123',
      cliente: 'Mariana Silva',
      email_cliente: 'mariana@email.com',
      total: 150,
      status: 'Confirmado',
      status_pagamento: 'aprovado',
      data: '2026-08-01T10:00:00Z'
    },
    {
      id: 2,
      user_id: 'usr-123',
      cliente: 'Mariana S.',
      email_cliente: 'mariana.nova@email.com',
      total: 250,
      status: 'Entregue',
      status_pagamento: 'aprovado',
      data: '2026-08-10T15:00:00Z'
    }
  ]

  const clientes = agruparClientesDosPedidos(pedidos)
  assert.equal(clientes.length, 1)
  assert.equal(clientes[0].userId, 'usr-123')
  assert.equal(clientes[0].pedidos.length, 2)
  assert.equal(clientes[0].totalGasto, 400)
  assert.equal(clientes[0].ticketMedio, 200)
  assert.equal(clientes[0].status, 'Recorrente')
})

test('agrupa por email normalizado quando nao ha user_id', () => {
  const pedidos = [
    {
      id: 10,
      cliente: 'Camila Souza',
      email: '  Camila@Teste.com  ',
      total: 100,
      status: 'Confirmado',
      status_pagamento: 'aprovado',
      data: '2026-08-05T12:00:00Z'
    },
    {
      id: 11,
      cliente: 'Camila Souza',
      email_cliente: 'camila@teste.com',
      total: 120,
      status: 'Enviado',
      status_pagamento: 'aprovado',
      data: '2026-08-08T14:00:00Z'
    }
  ]

  const clientes = agruparClientesDosPedidos(pedidos)
  assert.equal(clientes.length, 1)
  assert.equal(clientes[0].email, 'camila@teste.com')
  assert.equal(clientes[0].totalGasto, 220)
  assert.equal(clientes[0].status, 'Recorrente')
})

test('pedidos cancelados nao entram no faturamento nem no ticket medio', () => {
  const pedidos = [
    {
      id: 20,
      cliente: 'Fernanda Lima',
      email_cliente: 'fernanda@email.com',
      total: 200,
      status: 'Confirmado',
      status_pagamento: 'aprovado',
      data: '2026-08-02T10:00:00Z'
    },
    {
      id: 21,
      cliente: 'Fernanda Lima',
      email_cliente: 'fernanda@email.com',
      total: 350,
      status: 'Cancelado',
      status_pagamento: 'recusado',
      data: '2026-08-04T11:00:00Z'
    }
  ]

  const clientes = agruparClientesDosPedidos(pedidos)
  assert.equal(clientes.length, 1)
  assert.equal(clientes[0].pedidos.length, 2)
  assert.equal(clientes[0].pedidosValidos.length, 1)
  assert.equal(clientes[0].totalGasto, 200)
  assert.equal(clientes[0].ticketMedio, 200)
  assert.equal(clientes[0].status, 'Novo')
})

test('cliente com 1 compra recente e marcado como Novo', () => {
  const pedidos = [
    {
      id: 30,
      cliente: 'Beatriz Ramos',
      email_cliente: 'beatriz@email.com',
      total: 180,
      status: 'Confirmado',
      status_pagamento: 'aprovado',
      data: new Date().toISOString()
    }
  ]

  const clientes = agruparClientesDosPedidos(pedidos)
  assert.equal(clientes.length, 1)
  assert.equal(clientes[0].status, 'Novo')
})

test('cliente com 1 compra antiga ha mais de 90 dias e marcado como Inativo', () => {
  const dataAntiga = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
  const pedidos = [
    {
      id: 40,
      cliente: 'Clara Dias',
      email_cliente: 'clara@email.com',
      total: 90,
      status: 'Entregue',
      status_pagamento: 'aprovado',
      data: dataAntiga
    }
  ]

  const clientes = agruparClientesDosPedidos(pedidos)
  assert.equal(clientes.length, 1)
  assert.equal(clientes[0].status, 'Inativo')
})

test('filtragem e busca por nome, email e telefone', () => {
  const clientes = [
    { nome: 'Ana Paula', email: 'anapaula@email.com', telefone: '21999998888', status: 'Recorrente', totalGasto: 500, pedidos: [{}, {}], ultimaCompra: '2026-08-10' },
    { nome: 'Bruna Marquez', email: 'bruna@email.com', telefone: '21988887777', status: 'Novo', totalGasto: 200, pedidos: [{}], ultimaCompra: '2026-08-12' },
    { nome: 'Carla Perez', email: 'carla@email.com', telefone: '11977776666', status: 'Inativo', totalGasto: 150, pedidos: [{}], ultimaCompra: '2026-01-10' }
  ]

  const buscaNome = filtrarEOrdenarClientes(clientes, { busca: 'Paula' })
  assert.equal(buscaNome.length, 1)
  assert.equal(buscaNome[0].nome, 'Ana Paula')

  const buscaTel = filtrarEOrdenarClientes(clientes, { busca: '988887777' })
  assert.equal(buscaTel.length, 1)
  assert.equal(buscaTel[0].nome, 'Bruna Marquez')

  const filtroRecorrentes = filtrarEOrdenarClientes(clientes, { filtroStatus: 'recorrentes' })
  assert.equal(filtroRecorrentes.length, 1)
  assert.equal(filtroRecorrentes[0].nome, 'Ana Paula')

  const ordenadoMaiorValor = filtrarEOrdenarClientes(clientes, { ordenacao: 'maior-valor' })
  assert.equal(ordenadoMaiorValor[0].nome, 'Ana Paula')
  assert.equal(ordenadoMaiorValor[1].nome, 'Bruna Marquez')
})

test('ofuscacao de CPF e formatacao de telefone', () => {
  assert.equal(formatarCpfOfuscado('12345678901'), '***.456.789-**')
  assert.equal(formatarCpfOfuscado(null), 'Não informado')
  assert.equal(formatarTelefone('21999887766'), '(21) 99988-7766')
})
