type JsonObject = Record<string, unknown>

export type ResultadoRecusaMercadoPago = {
  orderId: string | null
  statusDetail: string
}

function eObjeto(valor: unknown): valor is JsonObject {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function codigoSeguro(valor: unknown) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null

  const codigo = String(valor)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return codigo ? codigo.slice(0, 120) : null
}

function orderIdSeguro(valor: unknown) {
  if (typeof valor !== 'string') return null

  const orderId = valor.trim()
  return orderId.length <= 120 && /^[A-Za-z0-9_-]+$/.test(orderId)
    ? orderId
    : null
}

function primeiroPagamento(order: JsonObject) {
  const transactions = eObjeto(order.transactions) ? order.transactions : null
  const payments = transactions && Array.isArray(transactions.payments)
    ? transactions.payments
    : []

  return eObjeto(payments[0]) ? payments[0] : null
}

export function extrairResultadoRecusaMercadoPago(
  corpo: unknown,
  fallbackStatusDetail: string,
): ResultadoRecusaMercadoPago {
  const envelope = eObjeto(corpo) ? corpo : null
  const order = envelope && eObjeto(envelope.data) ? envelope.data : envelope
  const pagamento = order ? primeiroPagamento(order) : null

  const statusTransacao = codigoSeguro(pagamento?.status)?.toLowerCase()
  const statusOrder = codigoSeguro(order?.status)?.toLowerCase()
  const detalheTransacao = codigoSeguro(pagamento?.status_detail)
  const detalheOrder = codigoSeguro(order?.status_detail)

  const respostaIndicaAprovacao =
    ['approved', 'processed'].includes(statusTransacao || '') ||
    ['approved', 'processed'].includes(statusOrder || '') ||
    detalheTransacao?.toLowerCase() === 'accredited' ||
    detalheOrder?.toLowerCase() === 'accredited'

  return {
    orderId: orderIdSeguro(order?.id),
    statusDetail: respostaIndicaAprovacao
      ? fallbackStatusDetail.slice(0, 120)
      : (detalheTransacao || detalheOrder || fallbackStatusDetail).slice(0, 120),
  }
}
