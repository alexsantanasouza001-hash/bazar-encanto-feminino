import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithEsbuild } from 'vite'

const TMP_DIR = path.resolve(process.cwd(), '.tmp_test_runner')

async function compilarComponenteParaTeste(caminhoRelativo, nomeTemp) {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true })
  }

  const caminhoAbsoluto = path.resolve(process.cwd(), caminhoRelativo)
  let codigo = fs.readFileSync(caminhoAbsoluto, 'utf-8')

  const statusHelpersUrl = pathToFileURL(path.resolve(process.cwd(), 'src/pages/statusHelpers.js')).href

  // Remover imports de CSS e mockar dependências
  codigo = codigo.replace(/import\s+['"][^'"]+\.css['"];?/g, '')
  codigo = codigo.replace(/import\s+{\s*consultarPagamento\s*}\s+from\s+['"][^'"]+['"];?/g, 'const consultarPagamento = () => {};')
  codigo = codigo.replace(/import\s+CheckoutSteps\s+from\s+['"][^'"]+['"];?/g, 'const CheckoutSteps = () => null;')
  codigo = codigo.replace(/import\s+{\s*obterStatusPagamento\s*}\s+from\s+['"][^'"]+['"];?/g, `
    import { obterStatusPagamento } from '${statusHelpersUrl}';
  `)

  const transformado = await transformWithEsbuild(codigo, caminhoRelativo, {
    loader: 'jsx',
    jsx: 'automatic'
  })

  const arquivoTemp = path.join(TMP_DIR, `${nomeTemp}.mjs`)
  fs.writeFileSync(arquivoTemp, transformado.code, 'utf-8')

  const modulo = await import(pathToFileURL(arquivoTemp).href)
  return modulo.default || modulo
}

test.after(() => {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true })
  }
})

test('Renderização real de PedidoCompleto com Pix Pendente e QR Code', async () => {
  const PedidoCompleto = await compilarComponenteParaTeste('src/pages/PedidoCompleto.jsx', 'PedidoCompleto')
  const PedidoErrorBoundary = await compilarComponenteParaTeste('src/components/PedidoErrorBoundary.jsx', 'PedidoErrorBoundary')

  const pedidoPix = {
    id: 1786458117038,
    numero: 'PED-1786458117038',
    status: 'Aguardando pagamento',
    status_pagamento: 'pendente',
    forma_pagamento: 'Pix',
    cliente: 'Maria Silva Teste',
    nomeCliente: 'Maria Silva Teste',
    email_cliente: 'cliente_teste@bazar.com',
    data: '2026-08-19T01:45:53.736Z',
    subtotal: 100.00,
    desconto: 0,
    valor_frete: 14.90,
    total: 114.90,
    reserva_status: 'reservado',
    cep_entrega: '22041001',
    endereco_entrega: 'Avenida Atlântica, 100, Copacabana, Rio de Janeiro - RJ',
    itens: [
      {
        produtoId: 1786813246820,
        produto_id: 1786813246820,
        nome: 'Vestido Floral 2027',
        cor: 'Rosa / Coral',
        tamanho: 'P',
        quantidade: 1,
        preco: 100.00,
        subtotal: 100.00
      }
    ],
    pagamento: {
      id: 'ORD01M0BV4HB4YAPVYFFBBFNAE0S4',
      status: 'action_required',
      status_detail: 'waiting_transfer',
      qr_code: '00020126470014br.gov.bcb.pix0125bazarencanto610@gmail.com5204000053039865405114.905802BR5917MARCELOSANTANA7506015Duque de Caxias62250521mpqrinter173611764395630482F2',
      qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAA...',
      ticket_url: 'https://www.mercadopago.com.br/payments/173611764395/ticket',
      expiracao: '2026-08-19T02:15:55.589Z'
    }
  }

  let html = ''
  assert.doesNotThrow(() => {
    html = renderToStaticMarkup(
      React.createElement(
        PedidoErrorBoundary,
        { pedido: pedidoPix },
        React.createElement(PedidoCompleto, {
          pedido: pedidoPix,
          onVoltarLoja: () => {},
          onWhatsApp: () => {}
        })
      )
    )
  }, 'Renderização de PedidoCompleto não deve lançar exceção nem ReferenceError')

  assert.ok(html.includes('PED-1786458117038'), 'Deve conter o número do pedido')
  assert.ok(html.includes('Aguardando pagamento'), 'Deve exibir o status Aguardando pagamento')
  assert.ok(html.includes('Pix copia e cola'), 'Deve exibir a seção de Pix copia e cola')
  assert.ok(html.includes('00020126470014br.gov.bcb.pix'), 'Deve conter a chave Copia e Cola')
  assert.ok(html.includes('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'), 'Deve renderizar imagem do QR Code')
  assert.ok(html.includes('Vestido Floral 2027'), 'Deve renderizar os itens do pedido')
  assert.ok(html.includes('114,90'), 'Deve renderizar o valor total')
})

test('PedidoErrorBoundary exibe fallback funcional quando ocorre erro', async () => {
  const PedidoErrorBoundary = await compilarComponenteParaTeste('src/components/PedidoErrorBoundary.jsx', 'PedidoErrorBoundary2')

  const pedidoMock = { id: 12345, numero: 'PED-12345' }
  const instance = new PedidoErrorBoundary({ pedido: pedidoMock })
  instance.state = { hasError: true, error: new Error('Falha teste') }
  
  const fallbackHtml = renderToStaticMarkup(instance.render())

  assert.ok(fallbackHtml.includes('Seu pedido foi registrado!'), 'Deve conter mensagem de sucesso do fallback')
  assert.ok(fallbackHtml.includes('PED-12345'), 'Deve preservar o número do pedido no fallback')
  assert.ok(fallbackHtml.includes('Acompanhar pedido'), 'Deve conter botão para acompanhar pedido')
})
