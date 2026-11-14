'use client'

/**
 * PagoKit — Página de suscripción con Mercado Pago Bricks
 *
 * Ruta: /[slug]/subscribe
 *
 * Flujo:
 *   1. Usuario elige plan + ingresa nombre/email → POST /api/checkout crea preference
 *   2. Brick se inicializa con preferenceId (necesario para "cuenta MP") + amount
 *   3. onSubmit del Brick recibe el token de tarjeta → POST /api/process-payment
 *   4. Backend crea pago en MP y devuelve { status, status_detail }
 *   5. approved → success | in_process/pending → pending | rejected → error inline
 *
 * Seguridad:
 *   Rule 1:  NEXT_PUBLIC_MP_PUBLIC_KEY desde process.env — nunca hardcodeada.
 *   Rule 12: CVV/PAN se tokeniza en el iframe de MP — nunca pasan por nuestro servidor.
 */

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DbPlan {
  id: string
  name: string
  priceClp: number
  intervalDays: number
}

const PLAN_FEATURES: Record<string, string[]> = {
  'Básico': ['1 programa de fidelización', 'Hasta 500 clientes', 'Apple Wallet + Google Wallet'],
  'Pro':    ['Programas ilimitados', 'Clientes ilimitados', 'Apple Wallet + Google Wallet', 'Notificaciones push'],
}

function featuresForPlan(name: string): string[] {
  return PLAN_FEATURES[name] ?? []
}

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => MpInstance
  }
}

interface MpInstance {
  bricks(): MpBricksBuilder
}

interface MpBricksBuilder {
  create(brickType: string, containerId: string, settings: MpBrickSettings): Promise<MpBrickController>
}

interface MpBrickController {
  unmount(): void
}

interface MpBrickSettings {
  initialization: { amount: number; preferenceId?: string }
  customization?: {
    paymentMethods?: { creditCard?: string; debitCard?: string }
    visual?: { style?: { theme?: string } }
  }
  callbacks: {
    onReady: () => void
    onError: (error: MpBrickError) => void
    onSubmit: (formData: MpFormData) => Promise<void>
  }
}

interface MpBrickError {
  type: string
  message: string
  field?: string
}

interface MpFormData {
  selectedPaymentMethod: string
  formData: {
    token?: string
    payment_method_id?: string
    issuer_id?: number
    installments?: number
    payer?: {
      email?: string
      identification?: { type?: string; number?: string }
    }
  }
}

// ─── Mensajes de rechazo en español ──────────────────────────────────────────

const REJECTION_MESSAGES: Record<string, string> = {
  cc_rejected_insufficient_amount:      'Fondos insuficientes en la tarjeta.',
  cc_rejected_bad_filled_security_code: 'Código de seguridad (CVV) incorrecto.',
  cc_rejected_bad_filled_date:          'Fecha de vencimiento incorrecta.',
  cc_rejected_bad_filled_other:         'Datos de la tarjeta incorrectos.',
  cc_rejected_call_for_authorize:       'Debes llamar a tu banco para autorizar este pago.',
  cc_rejected_card_disabled:            'Tarjeta inactiva. Contacta a tu banco.',
  cc_rejected_duplicated_payment:       'Pago duplicado. Ya realizaste un pago similar recientemente.',
  cc_rejected_high_risk:                'Pago rechazado por riesgo inusual.',
  cc_rejected_max_attempts:             'Límite de intentos alcanzado. Usa otra tarjeta.',
  cc_rejected_other_reason:             'El pago fue rechazado. Intenta con otra tarjeta.',
  pending_contingency:                  'El pago está en proceso. Te avisaremos por email.',
  pending_review_manual:                'El pago está siendo revisado. Te avisaremos por email.',
}

function rejectionMessage(statusDetail?: string | null): string {
  return (statusDetail ? REJECTION_MESSAGES[statusDetail] : null) ?? 'El pago fue rechazado. Intenta de nuevo.'
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function SubscribePage() {
  const params = useParams()
  const slug = params?.slug as string

  const [plans, setPlans] = useState<DbPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [step, setStep] = useState<'plan' | 'payment' | 'pending' | 'success' | 'error'>('plan')
  const [selectedPlan, setSelectedPlan] = useState<DbPlan | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [preferenceId, setPreferenceId] = useState<string | null>(null)
  const [initPoint, setInitPoint] = useState<string | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [payerEmail, setPayerEmail] = useState('')
  const [payerName, setPayerName] = useState('')
  // Error inline en el Brick para pagos rechazados (no navega fuera del form)
  const [brickError, setBrickError] = useState<string | null>(null)

  const brickControllerRef = useRef<MpBrickController | null>(null)
  const sdkLoadedRef = useRef(false)
  // Previene doble submit: ref en lugar de state para no causar re-render
  const submittingRef = useRef(false)

  useEffect(() => {
    fetch('/api/public/plans')
      .then(r => r.json())
      .then((data: DbPlan[]) => setPlans(data))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false))
  }, [])

  useEffect(() => {
    return () => { brickControllerRef.current?.unmount() }
  }, [])

  useEffect(() => {
    if (step !== 'payment' || !preferenceId) return
    if (sdkLoadedRef.current) { initBrick(); return }

    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.async = true
    script.onload = () => { sdkLoadedRef.current = true; initBrick() }
    script.onerror = () => {
      setErrorMsg('No se pudo cargar el SDK de Mercado Pago. Recarga la página.')
      setStep('error')
    }
    document.head.appendChild(script)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, preferenceId])

  async function initBrick() {
    if (!window.MercadoPago || !selectedPlan) return

    const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY
    if (!publicKey) {
      setErrorMsg('Configuración de pago no disponible. Contacta al soporte.')
      setStep('error')
      return
    }

    brickControllerRef.current?.unmount()
    setBrickError(null)

    const mp = new window.MercadoPago(publicKey, { locale: 'es-CL' })
    const bricksBuilder = mp.bricks()

    try {
      brickControllerRef.current = await bricksBuilder.create('payment', 'mp-payment-brick', {
        initialization: {
          amount: selectedPlan.priceClp,
          preferenceId: preferenceId!,
        },
        customization: {
          paymentMethods: { creditCard: 'all', debitCard: 'all' },
          visual: { style: { theme: 'default' } },
        },
        callbacks: {
          onReady: () => setLoading(false),
          onError: (error: MpBrickError) => {
            console.error('[mp-brick] error:', error.type, error.message)
            setErrorMsg(`Error en el formulario de pago: ${error.message}`)
            setStep('error')
          },
          onSubmit: async (mpData: MpFormData) => {
            await handleBrickSubmit(mpData)
          },
        },
      })
    } catch (err) {
      console.error('[mp-brick] no se pudo inicializar:', err)
      setErrorMsg('No se pudo inicializar el formulario de pago.')
      setStep('error')
    }
  }

  async function handlePlanSelection() {
    if (!selectedPlan || !payerEmail || !payerName || !slug) return
    setLoading(true)
    setErrorMsg('')

    try {
      const bizRes = await fetch(`/api/public/businesses/${encodeURIComponent(slug)}`)
      if (!bizRes.ok) throw new Error('No se encontró el negocio')
      const bizData = (await bizRes.json()) as { id?: string }
      if (!bizData.id) throw new Error('ID de negocio no disponible')

      setBusinessId(bizData.id)

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: bizData.id,
          planId: selectedPlan.id,
          payerEmail,
          payerName,
        }),
      })

      const rawText = await res.text()
      let resData: { error?: string; preferenceId?: string; initPoint?: string }
      try { resData = JSON.parse(rawText) } catch {
        throw new Error(`Error inesperado del servidor (HTTP ${res.status})`)
      }

      if (!res.ok) throw new Error(resData.error ?? `Error al iniciar el pago (HTTP ${res.status})`)

      setPreferenceId(resData.preferenceId!)
      setInitPoint(resData.initPoint ?? null)
      setStep('payment')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error desconocido')
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  async function handleBrickSubmit(mpData: MpFormData): Promise<void> {
    // Prevenir doble submit
    if (submittingRef.current) return
    submittingRef.current = true
    setBrickError(null)

    try {
      // Para "cuenta Mercado Pago" el Brick redirige via preferenceId — sin token
      if (!mpData.formData.token) {
        if (initPoint) window.location.href = initPoint
        return
      }

      if (!businessId || !selectedPlan) throw new Error('Estado inválido')

      const res = await fetch('/api/process-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData:   mpData.formData,
          businessId,
          planId:     selectedPlan.id,
        }),
      })

      const data: { id?: string | number; status?: string; status_detail?: string; error?: string } =
        await res.json()

      if (!res.ok) {
        // Error de servidor — throw para que el Brick re-habilite el formulario
        throw new Error(data.error ?? 'Error del servidor')
      }

      const status = data.status ?? ''

      if (status === 'approved') {
        window.location.href = 'https://www.misstamps.com/admin/dashboard'
        return
      }

      if (status === 'in_process' || status === 'pending') {
        setStep('pending')
        return
      }

      // rejected — mostrar mensaje inline y throw para que el Brick re-habilite el form
      const msg = rejectionMessage(data.status_detail)
      setBrickError(msg)
      throw new Error(data.status_detail ?? 'payment_rejected')
    } catch (err) {
      submittingRef.current = false
      throw err // re-throw obligatorio: el Brick lo necesita para re-habilitarse
    } finally {
      submittingRef.current = false
    }
  }

  // ─── Renders ─────────────────────────────────────────────────────────────

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Pago aprobado!</h1>
          <p className="text-gray-500 text-sm mb-6">
            Tu suscripción al plan <strong>{selectedPlan?.name}</strong> está activa. Recibirás un correo de confirmación.
          </p>
          <a
            href={`/${slug}`}
            className="inline-block px-6 py-2 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition"
          >
            Ir al panel
          </a>
        </div>
      </div>
    )
  }

  if (step === 'pending') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Pago en revisión</h1>
          <p className="text-gray-500 text-sm mb-6">
            Tu pago está siendo procesado. Recibirás un correo cuando sea confirmado (puede tardar hasta 24 h).
          </p>
          <a
            href={`/${slug}`}
            className="inline-block px-6 py-2 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Ocurrió un error</h1>
          <p className="text-red-600 text-sm mb-6">{errorMsg}</p>
          <button
            onClick={() => { setStep('plan'); setErrorMsg('') }}
            className="px-6 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-700 transition"
          >
            Volver a intentarlo
          </button>
        </div>
      </div>
    )
  }

  if (step === 'payment') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white mb-1">Completa tu pago</h1>
            <p className="text-slate-400 text-sm">
              Plan <strong className="text-white">{selectedPlan?.name}</strong> —{' '}
              ${selectedPlan?.priceClp.toLocaleString('es-CL')} CLP/mes
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-6">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <svg className="animate-spin h-8 w-8 text-slate-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}

            {/* Rule 12: el brick de MP maneja PAN/CVV internamente */}
            <div id="mp-payment-brick" />

            {/* Mensaje de rechazo inline — el Brick permanece activo para reintentar */}
            {brickError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
                {brickError}
              </div>
            )}
          </div>

          <button
            onClick={() => setStep('plan')}
            className="mt-4 w-full text-slate-400 text-sm hover:text-white transition text-center"
          >
            Cambiar plan
          </button>
        </div>
      </div>
    )
  }

  // ── Paso 1: Seleccionar plan ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Elige tu plan</h1>
          <p className="text-slate-400">Accede a la plataforma de tarjetas de fidelización</p>
        </div>

        {plansLoading ? (
          <div className="flex justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-white/50" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : plans.length === 0 ? (
          <p className="text-center text-slate-400 py-8">No hay planes disponibles en este momento.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan)}
                className={`p-6 rounded-2xl text-left transition border-2 ${
                  selectedPlan?.id === plan.id
                    ? 'bg-white border-white text-slate-900 shadow-2xl scale-[1.02]'
                    : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                }`}
              >
                <p className="text-lg font-bold mb-1">{plan.name}</p>
                <p className="text-2xl font-black mb-4">
                  ${plan.priceClp.toLocaleString('es-CL')}
                  <span className="text-sm font-normal ml-1">CLP/mes</span>
                </p>
                <ul className="space-y-1">
                  {featuresForPlan(plan.name).map((f) => (
                    <li key={f} className="text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        )}

        {selectedPlan && (
          <div className="bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Datos de facturación</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                placeholder="Tu nombre completo"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
              <input
                type="email"
                value={payerEmail}
                onChange={(e) => setPayerEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 transition"
              />
            </div>

            <button
              onClick={handlePlanSelection}
              disabled={loading || !payerEmail || !payerName}
              className="w-full py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Preparando pago...
                </span>
              ) : (
                `Continuar con ${selectedPlan.name} — $${selectedPlan.priceClp.toLocaleString('es-CL')} CLP/mes`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
