export type AmbienteMercadoPago = 'sandbox' | 'production'

export function obterAmbienteMercadoPago(
  valor: string | undefined,
): AmbienteMercadoPago | null {
  const ambiente = valor?.trim().toLowerCase()

  return ambiente === 'sandbox' || ambiente === 'production'
    ? ambiente
    : null
}
export function usarPagadorSintetico(
  ambiente: AmbienteMercadoPago,
) {
  return ambiente === 'sandbox'
}

export function usarPagadorPixSintetico(
  ambiente: AmbienteMercadoPago,
  _formaPagamento?: string,
) {
  return ambiente === 'sandbox'
}
