'use client'

// SECURITY_RULES applied in this component:
//   Rule 11: Minimum PII — email pre-fills the MP Brick and is passed to authorize endpoint only
//   Rule 12: No CVV, PAN, or track-data handled here — MP Brick tokenizes entirely client-side
// PCI DSS 4.0.1 req. 6.4.3: external script inventoried in /payment-page-scripts.json

import { useEffect, useRef, useState } from 'react'

// ── Minimal MP browser-SDK types (local to this file) ───────────────────────
interface MpCardFormData {
  token: string
  installments: number
  payment_method_id: string
  issuer_id: string | number
  payer: { email: string; identification?: { type: string; number: string } }
}

interface MpBrickController {
  unmount(): void
}

declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string,
      options?: { locale: string },
    ) => {
      bricks(): {
        create(
          type: 'cardPayment',
          containerId: string,
          settings: {
            initialization: { amount: number; payer?: { email?: string } }
            customization?: { paymentMethods?: { creditCard?: string; debitCard?: string } }
            callbacks: {
              onReady(): void
              onSubmit(formData: MpCardFormData): Promise<void>
              onError(err: unknown): void
            }
          },
        ): Promise<MpBrickController>
      }
    }
  }
}
// ────────────────────────────────────────────────────────────────────────────

interface Props {
  amount: number
  planId: string
  businessId: string
  userEmail: string
  onSuccess(): void
  onCancel(): void
}

const BRICK_CONTAINER = 'mp-card-brick-container'
const SDK_SCRIPT_ID = 'mp-sdk-v2'
// Script inventoried in payment-page-scripts.json (PCI DSS 4.0.1 req. 6.4.3)
const SDK_URL = 'https://sdk.mercadopago.com/js/v2'

export default function CardPaymentBrick({
  amount,
  planId,
  businessId,
  userEmail,
  onSuccess,
  onCancel,
}: Props) {
  const unmountRef = useRef<(() => void) | null>(null)
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => { onSuccessRef.current = onSuccess }, [onSuccess])

  const [brickReady, setBrickReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSdk(): Promise<void> {
      if (window.MercadoPago) return
      await new Promise<void>((resolve, reject) => {
        const existing = document.getElementById(SDK_SCRIPT_ID)
        if (existing) {
          if (window.MercadoPago) { resolve(); return }
          existing.addEventListener('load', () => resolve())
          existing.addEventListener('error', () => reject(new Error('SDK load failed')))
          return
        }
        const script = document.createElement('script')
        script.id = SDK_SCRIPT_ID
        script.src = SDK_URL
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('SDK load failed'))
        document.head.appendChild(script)
      })
    }

    async function mount() {
      const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY
      if (!publicKey) {
        setErrorMsg('Clave pública de Mercado Pago no configurada.')
        return
      }

      await loadSdk()
      if (cancelled || !window.MercadoPago) return

      const mp = new window.MercadoPago(publicKey, { locale: 'es-CL' })
      const builder = mp.bricks()

      const controller = await builder.create('cardPayment', BRICK_CONTAINER, {
        initialization: { amount, payer: { email: userEmail } },
        customization: { paymentMethods: { creditCard: 'all', debitCard: 'all' } },
        callbacks: {
          onReady: () => { if (!cancelled) setBrickReady(true) },

          // Rule 12: formData.token is the MP-issued card token — never raw card data
          onSubmit: async (formData: MpCardFormData) => {
            if (cancelled) return
            const token = formData.token ?? ''
            const email = formData.payer?.email ?? userEmail
            if (!token) {
              setErrorMsg('No se obtuvo el token de tarjeta. Intenta de nuevo.')
              return
            }
            setSubmitting(true)
            setErrorMsg(null)
            try {
              const res = await fetch('/api/subscriptions/authorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId, businessId, cardTokenId: token, payerEmail: email }),
              })
              const json = (await res.json()) as { status?: string; error?: string }
              if (!res.ok) {
                setErrorMsg(json.error ?? 'No se pudo procesar el pago. Intenta de nuevo.')
              } else {
                onSuccessRef.current()
              }
            } catch {
              setErrorMsg('Error de red. Verifica tu conexión e intenta de nuevo.')
            } finally {
              if (!cancelled) setSubmitting(false)
            }
          },

          onError: (err: unknown) => {
            if (!cancelled) {
              console.error('[CardPaymentBrick] brick error', err)
              setErrorMsg('Error en el formulario de pago. Recarga la página e intenta de nuevo.')
            }
          },
        },
      })

      if (cancelled) {
        controller.unmount()
      } else {
        unmountRef.current = () => controller.unmount()
      }
    }

    mount().catch((err: unknown) => {
      if (!cancelled) {
        console.error('[CardPaymentBrick] mount error', err)
        setErrorMsg('No se pudo cargar el formulario de pago.')
      }
    })

    return () => {
      cancelled = true
      unmountRef.current?.()
      unmountRef.current = null
    }
  // Re-mount only when the payment context changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, planId, businessId, userEmail])

  return (
    <div>
      {!brickReady && !errorMsg && (
        <p className="text-sm text-gray-400 animate-pulse mb-3">Cargando formulario de pago…</p>
      )}
      {submitting && (
        <p className="text-sm text-blue-600 animate-pulse mb-2">Procesando pago…</p>
      )}
      {errorMsg && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {errorMsg}
        </div>
      )}
      {/* MP Brick renders into this div — must remain in DOM while brick is mounted */}
      <div id={BRICK_CONTAINER} />
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="mt-3 text-sm text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
      >
        ← Volver a elegir método
      </button>
    </div>
  )
}
