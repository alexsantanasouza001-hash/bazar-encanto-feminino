export type EscopoRateLimit =
  | 'checkout_ip_5m'
  | 'checkout_ip_1h'
  | 'checkout_email_30m'
  | 'checkout_user_30m'
  | 'pix_ip_30m'
  | 'pix_email_45m'

export type RegraRateLimit = {
  escopo: EscopoRateLimit
  identidade: string
}
function primeiroHeaderIp(valor: string | null) {
  return valor?.split(',')[0]?.trim() || null
}

function ipPlausivel(valor: string | null) {
  if (!valor || valor.length > 64 || /[^0-9a-fA-F:.]/.test(valor)) {
    return null
  }

  return valor
}

export function obterIpCliente(request: Request) {
  return (
    ipPlausivel(primeiroHeaderIp(request.headers.get('cf-connecting-ip'))) ||
    ipPlausivel(primeiroHeaderIp(request.headers.get('x-forwarded-for'))) ||
    ipPlausivel(primeiroHeaderIp(request.headers.get('x-real-ip')))
  )
}

export function criarRegrasRateLimit({
  ip,
  email,
  userId,
  pix,
}: {
  ip: string | null
  email: string
  userId: string | null
  pix: boolean
}) {
  const regras: RegraRateLimit[] = []

  if (ip) {
    regras.push(
      { escopo: 'checkout_ip_5m', identidade: ip },
      { escopo: 'checkout_ip_1h', identidade: ip },
    )
  }

  regras.push({
    escopo: 'checkout_email_30m',
    identidade: email.trim().toLowerCase(),
  })

  if (userId) {
    regras.push({
      escopo: 'checkout_user_30m',
      identidade: userId.toLowerCase(),
    })
  }

  if (pix) {
    if (ip) {
      regras.push({
        escopo: 'pix_ip_30m',
        identidade: ip,
      })
    }

    regras.push({
      escopo: 'pix_email_45m',
      identidade: email.trim().toLowerCase(),
    })
  }

  return regras
}

async function hmacHex(chave: string, valor: string) {
  const encoder = new TextEncoder()
  const chaveCriptografica = await crypto.subtle.importKey(
    'raw',
    encoder.encode(chave),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const assinatura = await crypto.subtle.sign(
    'HMAC',
    chaveCriptografica,
    encoder.encode(valor),
  )

  return Array.from(new Uint8Array(assinatura))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function anonimizarRateLimit(
  chaveServidor: string,
  categoria: string,
  valor: string,
) {
  return hmacHex(
    chaveServidor,
    `bazar-checkout-rate-limit:${categoria}:${valor}`,
  )
}
