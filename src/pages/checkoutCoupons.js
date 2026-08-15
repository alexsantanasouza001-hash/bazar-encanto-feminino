// Fonte temporária de cupons. Futuramente este objeto poderá ser
// substituído por uma consulta ao Supabase sem alterar as telas.
export const CUPONS_TESTE = {
  ENCANTO10: {
    codigo: 'ENCANTO10',
    percentual: 10
  }
}

export function normalizarCodigoCupom(codigo) {
  return String(codigo || '')
    .trim()
    .toUpperCase()
}

export function buscarCupomTeste(codigo) {
  return CUPONS_TESTE[
    normalizarCodigoCupom(codigo)
  ] || null
}

export function resolverAplicacaoCupom(
  codigo,
  cupomAplicado
) {
  const codigoNormalizado =
    normalizarCodigoCupom(codigo)

  if (
    cupomAplicado?.codigo ===
    codigoNormalizado
  ) {
    return {
      status: 'duplicado',
      cupom: cupomAplicado
    }
  }

  const cupom =
    buscarCupomTeste(
      codigoNormalizado
    )

  return cupom
    ? {
        status: 'sucesso',
        cupom
      }
    : {
        status: 'invalido',
        cupom: null
      }
}

export function calcularTotaisCupom(
  subtotal,
  cupom
) {
  const subtotalSeguro =
    Number(subtotal || 0)

  const desconto = cupom
    ? Math.round(
        subtotalSeguro *
        (cupom.percentual / 100) *
        100
      ) / 100
    : 0

  return {
    subtotal: subtotalSeguro,
    desconto,
    total: Math.max(
      0,
      subtotalSeguro - desconto
    )
  }
}
