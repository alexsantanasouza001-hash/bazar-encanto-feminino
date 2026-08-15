import { useRef } from 'react'
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react'

const publicKey = import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY

if (publicKey) {
  initMercadoPago(publicKey, { locale: 'pt-BR' })
}

function MercadoPagoCard({ amount, disabled, onSubmit }) {
  const pagamentoConcluidoRef = useRef(false)

  if (!publicKey) {
    return (
      <div className="checkout-payment-setup" role="status">
        Pagamento por cartão temporariamente indisponível.
      </div>
    )
  }

  return (
    <div className={disabled ? 'checkout-card-brick disabled' : 'checkout-card-brick'}>
      <CardPayment
        initialization={{ amount: Number(amount || 0) }}
        customization={{
          visual: {
            style: {
              theme: 'default'
            }
          },
          paymentMethods: {
            minInstallments: 1,
            maxInstallments: 12
          }
        }}
        onSubmit={async (formData, additionalData) => {
          pagamentoConcluidoRef.current = false

          if (disabled) {
            throw new Error('Finalização temporariamente indisponível.')
          }

          const resultado = await onSubmit({
            token: formData.token,
            payment_method_id: formData.payment_method_id,
            payment_type_id: formData.payment_type_id || additionalData?.paymentTypeId || 'credit_card',
            installments: formData.installments
          })

          if (!resultado?.sucesso) {
            throw new Error(
              resultado?.mensagem ||
              'Não foi possível processar o cartão.'
            )
          }

          pagamentoConcluidoRef.current = true
        }}
        onError={(erro) => {
          if (pagamentoConcluidoRef.current) {
            return
          }

          console.error('Erro no Card Payment Brick:', erro)
        }}
      />
    </div>
  )
}

export default MercadoPagoCard
