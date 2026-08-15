export const LIMITE_FRETE_GRATIS = 400
export const VALOR_FRETE_SUL_SUDESTE = 19.9

const UFS_SUDESTE = new Set(['SP', 'RJ', 'MG', 'ES'])
const UFS_SUL = new Set(['PR', 'SC', 'RS'])

function arredondarMoeda(valor) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100
}

export function normalizarCepFrete(valor) {
  return String(valor || '').replace(/\D/g, '').slice(0, 8)
}

export function calcularRegraFrete({
  subtotal,
  desconto,
  uf,
  cepConfirmado = false
}) {
  const baseFreteGratis = Math.max(
    0,
    arredondarMoeda(Number(subtotal || 0) - Number(desconto || 0))
  )

  if (baseFreteGratis >= LIMITE_FRETE_GRATIS) {
    return {
      status: 'gratis',
      valido: true,
      valor: 0,
      regiao: 'Brasil',
      baseFreteGratis
    }
  }

  const estado = String(uf || '').trim().toUpperCase()

  if (!cepConfirmado || !estado) {
    return {
      status: 'aguardando_cep',
      valido: false,
      valor: null,
      regiao: null,
      baseFreteGratis
    }
  }

  if (UFS_SUDESTE.has(estado) || UFS_SUL.has(estado)) {
    return {
      status: 'fixo',
      valido: true,
      valor: VALOR_FRETE_SUL_SUDESTE,
      regiao: UFS_SUDESTE.has(estado) ? 'Sudeste' : 'Sul',
      baseFreteGratis
    }
  }

  return {
    status: 'consultar',
    valido: false,
    valor: null,
    regiao: 'Demais regiões',
    baseFreteGratis
  }
}

export function calcularIncentivoFreteGratis(baseFreteGratis) {
  return Math.max(
    0,
    arredondarMoeda(LIMITE_FRETE_GRATIS - Number(baseFreteGratis || 0))
  )
}
