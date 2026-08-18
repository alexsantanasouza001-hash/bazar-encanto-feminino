import { supabase } from '../lib/supabase.js'

export const LIMITE_FRETE_GRATIS = 400

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
  cepConfirmado = false,
  servicoSelecionado = null
}) {
  const baseFreteGratis = Math.max(
    0,
    arredondarMoeda(Number(subtotal || 0) - Number(desconto || 0))
  )

  // 1. Elegível a Frete Grátis para todo o Brasil (subtotal >= R$ 400)
  if (baseFreteGratis >= LIMITE_FRETE_GRATIS) {
    return {
      status: 'gratis',
      valido: true,
      valor: 0,
      regiao: 'Brasil',
      servico: 'Frete Grátis',
      baseFreteGratis
    }
  }

  const estado = String(uf || '').trim().toUpperCase()

  // 2. Aguardando preenchimento do CEP
  if (!cepConfirmado || !estado) {
    return {
      status: 'aguardando_cep',
      valido: false,
      valor: null,
      regiao: null,
      servico: null,
      baseFreteGratis
    }
  }

  // 3. Se um serviço de frete real (PAC / SEDEX) foi calculado e selecionado
  if (
    servicoSelecionado &&
    Number.isFinite(Number(servicoSelecionado.valor)) &&
    Number(servicoSelecionado.valor) >= 0
  ) {
    return {
      status: 'calculado',
      valido: true,
      valor: arredondarMoeda(servicoSelecionado.valor),
      regiao: estado,
      servico: servicoSelecionado.nome || 'Entrega',
      prazo: servicoSelecionado.prazo || null,
      baseFreteGratis
    }
  }

  // 4. CEP informado, aguardando cálculo por integração logística
  return {
    status: 'consultar',
    valido: false,
    valor: null,
    regiao: estado,
    servico: null,
    baseFreteGratis
  }
}

export function calcularIncentivoFreteGratis(baseFreteGratis) {
  return Math.max(
    0,
    arredondarMoeda(LIMITE_FRETE_GRATIS - Number(baseFreteGratis || 0))
  )
}

export async function cotarFreteMelhorEnvio({ cepDestino, itens }) {
  const cepNormalizado = normalizarCepFrete(cepDestino)
  if (cepNormalizado.length !== 8) {
    return {
      sucesso: false,
      mensagem: 'Informe um CEP de destino válido.'
    }
  }

  const itensFormatados = (itens || []).map((item) => ({
    produto_id: Number(item.produto_id || item.id),
    quantidade: Math.max(1, Number(item.quantidade || 1))
  })).filter((i) => i.produto_id > 0)

  if (itensFormatados.length === 0) {
    return {
      sucesso: false,
      mensagem: 'Carrinho sem itens válidos para cotação.'
    }
  }

  try {
    const { data, error } = await supabase.functions.invoke('calcular-frete', {
      body: {
        cep_destino: cepNormalizado,
        itens: itensFormatados
      }
    })

    if (error) {
      return {
        sucesso: false,
        mensagem: data?.mensagem || 'Não foi possível cotar o frete no momento.'
      }
    }

    return {
      sucesso: Boolean(data?.sucesso),
      opcoes: data?.opcoes || [],
      mensagem: data?.mensagem || null,
      configurado: data?.configurado !== false
    }
  } catch {
    return {
      sucesso: false,
      mensagem: 'Não foi possível calcular o frete agora. Tente novamente.'
    }
  }
}

