'use client'

// SECURITY_RULES applied in this file:
//   Rule 11: Minimum PII — no card data collected here; MP Brick tokenizes client-side
//   Rule 12: No CVV, PAN, or track-data referenced

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import CardPaymentBrick from './CardPaymentBrick'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Plan {
  id: string
  name: string
  description: string
  price: number
  priceFormatted: string
  interval: 'MONTHLY' | 'ANNUAL'
  features: string[]
}

type PaymentMethod = 'card' | 'mp_account'

type FlowState =
  | { mode: 'idle' }
  | { mode: 'method-select'; plan: Plan }
  | { mode: 'mp-account'; plan: Plan }
  | { mode: 'card'; plan: Plan }
  | { mode: 'mp-loading'; planId: string }

interface Props {
  plans: Plan[]
  businessId: string
  userEmail: string
  activeSubscriptionStatus: 'PENDING' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | null
  hasActiveMpSubscription: boolean
  returnFromMp: boolean
}

export default function SubscriptionPlans({ plans, businessId, userEmail, activeSubscriptionStatus, hasActiveMpSubscription, returnFromMp }: Props) {
  const router = useRouter()
  const [flow, setFlow] = useState<FlowState>({ mode: 'idle' })
  const [mpPayerEmail, setMpPayerEmail] = useState(userEmail)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const canSubscribe =
    activeSubscriptionStatus === null ||
    activeSubscriptionStatus === 'CANCELLED' ||
    activeSubscriptionStatus === 'PAST_DUE' ||
    activeSubscriptionStatus === 'TRIALING' ||
    activeSubscriptionStatus === 'PENDING'

  const isRetry =
    activeSubscriptionStatus === 'TRIALING' || activeSubscriptionStatus === 'PENDING'

  // Defined early so the useEffect below can reference it without hitting the TDZ
  const showSyncButton =
    hasActiveMpSubscription &&
    (activeSubscriptionStatus === 'TRIALING' || activeSubscriptionStatus === 'PENDING')

  function choosePlan(plan: Plan) {
    setFlow({ mode: 'method-select', plan })
    setErrorMsg(null)
    setEmailError(null)
  }

  function chooseMethod(method: PaymentMethod) {
    if (flow.mode !== 'method-select') return
    setFlow({ mode: method === 'card' ? 'card' : 'mp-account', plan: flow.plan })
    setErrorMsg(null)
  }

  function cancel() {
    setFlow({ mode: 'idle' })
    setErrorMsg(null)
    setEmailError(null)
  }

  async function handleMpAccount() {
    if (flow.mode !== 'mp-account') return
    const currentPlan = flow.plan  // capture before any state change
    const email = mpPayerEmail.trim()
    if (!EMAIL_RE.test(email)) {
      setEmailError('Ingresa un email válido antes de continuar.')
      return
    }
    setEmailError(null)
    setErrorMsg(null)
    setFlow({ mode: 'mp-loading', planId: currentPlan.id })
    try {
      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Rule 11: email sent only to identify payer's MP account; never stored client-side
        body: JSON.stringify({ planId: currentPlan.id, businessId, mpPayerEmail: email }),
      })
      const data = (await res.json()) as { init_point?: string; error?: string }
      if (!res.ok || !data.init_point) {
        setErrorMsg(data.error ?? 'No se pudo iniciar el pago. Intenta de nuevo.')
        setFlow({ mode: 'mp-account', plan: currentPlan })
        return
      }
      // Redirect to MP-hosted checkout — Rule 11 (no card data handled client-side)
      router.push(data.init_point)
    } catch {
      setErrorMsg('Error de red. Verifica tu conexión e intenta de nuevo.')
      setFlow({ mode: 'idle' })
    }
  }

  const handleCardSuccess = useCallback(() => {
    setFlow({ mode: 'idle' })
    router.refresh()
  }, [router])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/subscriptions/sync', { method: 'POST' })
      const data = (await res.json()) as { status?: string; error?: string }
      if (!res.ok) {
        setSyncMsg(data.error ?? 'No se pudo verificar el estado.')
      } else if (data.status === 'ACTIVE') {
        router.refresh()
      } else if (data.status === 'CANCELLED') {
        setSyncMsg('El pago fue rechazado. Puedes intentar con otro método de pago.')
        setTimeout(() => router.refresh(), 1500)
      } else {
        setSyncMsg('El pago aún está siendo procesado. Intenta en unos minutos.')
      }
    } catch {
      setSyncMsg('Error de red. Verifica tu conexión e intenta de nuevo.')
    } finally {
      setSyncing(false)
    }
  }, [router])

  // Auto-sync once when MP redirects back with preapproval_id in the URL
  const autoSyncDone = useRef(false)
  useEffect(() => {
    if (returnFromMp && showSyncButton && !autoSyncDone.current) {
      autoSyncDone.current = true
      handleSync()
    }
  }, [returnFromMp, showSyncButton, handleSync])

  if (plans.length === 0) {
    return (
      <p className="text-gray-400 text-center py-16">
        No hay planes disponibles en este momento.
      </p>
    )
  }

  const activePlanId =
    flow.mode === 'method-select' || flow.mode === 'mp-account' || flow.mode === 'card'
      ? flow.plan.id
      : flow.mode === 'mp-loading'
        ? flow.planId
        : null

  return (
    <div>
      {/* ── Sync / verify payment ─────────────────────────────────────────── */}
      {showSyncButton && (
        <div className="mb-6">
          {returnFromMp ? (
            /* Auto-sync mode: spinner while checking, error + retry if it fails */
            syncing ? (
              <div className="flex items-center gap-2 text-sm text-yellow-700">
                <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Verificando tu pago…
              </div>
            ) : syncMsg ? (
              <div>
                <p className="text-sm text-red-600 mb-2">{syncMsg}</p>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="rounded-xl bg-yellow-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Reintentar verificación
                </button>
              </div>
            ) : null
          ) : (
            /* Manual mode: keep the original button for users who navigate here directly */
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="rounded-xl bg-yellow-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {syncing ? 'Verificando…' : '🔄 Verificar estado del pago'}
              </button>
              {syncMsg && (
                <p className="mt-2 text-sm text-gray-600">{syncMsg}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Plan grid ─────────────────────────────────────────────────────── */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isSelected = activePlanId === plan.id
          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition-shadow ${
                isSelected
                  ? 'border-blue-500 ring-2 ring-blue-200 shadow-md'
                  : 'border-gray-200 hover:shadow-md'
              }`}
            >
              <div className="mb-4">
                <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
                {plan.description && (
                  <p className="mt-1 text-sm text-gray-500">{plan.description}</p>
                )}
              </div>

              <div className="mb-6">
                <span className="text-3xl font-extrabold text-gray-900">{plan.priceFormatted}</span>
                <span className="ml-1 text-sm text-gray-500">
                  /{plan.interval === 'MONTHLY' ? 'mes' : 'año'}
                </span>
              </div>

              {plan.features.length > 0 && (
                <ul className="mb-6 space-y-2 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="mt-0.5 text-green-500 font-bold" aria-hidden>&#10003;</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              )}

              <button
                onClick={() => choosePlan(plan)}
                disabled={
                  !canSubscribe ||
                  flow.mode === 'mp-loading' ||
                  (activePlanId !== null && activePlanId !== plan.id)
                }
                className={`mt-auto w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSelected ? 'bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSelected
                  ? '✓ Seleccionado'
                  : flow.mode === 'mp-loading' && flow.planId === plan.id
                    ? 'Redirigiendo…'
                    : isRetry
                      ? 'Reintentar pago'
                      : 'Suscribirse'}
              </button>
            </div>
          )
        })}
      </div>

      {/* ── Payment flow panel ────────────────────────────────────────────── */}
      {activePlanId && flow.mode !== 'mp-loading' && (() => {
        const currentPlan =
          flow.mode === 'method-select' || flow.mode === 'mp-account' || flow.mode === 'card'
            ? flow.plan
            : null
        if (!currentPlan) return null

        return (
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            {/* Plan summary + cancel */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-sm text-gray-500 mb-0.5">Plan seleccionado</p>
                <p className="font-semibold text-gray-900">
                  {currentPlan.name}{' '}
                  <span className="text-gray-400 font-normal text-sm">
                    — {currentPlan.priceFormatted}/{currentPlan.interval === 'MONTHLY' ? 'mes' : 'año'}
                  </span>
                </p>
              </div>
              <button
                onClick={cancel}
                className="text-sm text-gray-400 hover:text-gray-600 ml-4 shrink-0"
              >
                Cancelar
              </button>
            </div>

            {/* Method selector */}
            {flow.mode === 'method-select' && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">¿Cómo quieres pagar?</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => chooseMethod('card')}
                    className="flex-1 rounded-xl border-2 border-gray-200 bg-white px-4 py-4 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <p className="font-semibold text-gray-900 text-sm">💳 Tarjeta de crédito o débito</p>
                    <Image
                      src="/medios-pago-online.webp"
                      alt="Medios de pago"
                      width={2960}
                      height={348}
                      className="h-6 w-auto mt-2"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Paga directamente con tu tarjeta, sin necesidad de cuenta Mercado Pago.
                    </p>
                  </button>
                  <button
                    onClick={() => chooseMethod('mp_account')}
                    className="flex-1 rounded-xl border-2 border-gray-200 bg-white px-4 py-4 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <Image
                      src="/logo-mercado-pago.webp"
                      alt="Mercado Pago"
                      width={736}
                      height={414}
                      className="h-9 w-auto"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Inicia sesión en Mercado Pago para suscribirte.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* MP account flow */}
            {flow.mode === 'mp-account' && (
              <div>
                <button
                  onClick={() => setFlow({ mode: 'method-select', plan: flow.plan })}
                  className="text-xs text-gray-400 hover:text-gray-600 mb-4 underline"
                >
                  ← Cambiar método
                </button>
                <div className="mb-4">
                  <label
                    htmlFor="mp-payer-email"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Email de tu cuenta Mercado Pago
                  </label>
                  <input
                    id="mp-payer-email"
                    type="email"
                    value={mpPayerEmail}
                    onChange={(e) => {
                      setMpPayerEmail(e.target.value)
                      setEmailError(null)
                      setErrorMsg(null)
                    }}
                    placeholder="tu@email.com"
                    className="w-full md:w-96 px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Debe ser el email con el que inicias sesión en Mercado Pago Chile
                  </p>
                  {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
                </div>
                {errorMsg && (
                  <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
                    {errorMsg}
                  </div>
                )}
                <button
                  onClick={handleMpAccount}
                  className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  Continuar a Mercado Pago →
                </button>
              </div>
            )}

            {/* Card brick flow */}
            {flow.mode === 'card' && (
              <CardPaymentBrick
                amount={currentPlan.price}
                planId={currentPlan.id}
                businessId={businessId}
                userEmail={userEmail}
                onSuccess={handleCardSuccess}
                onCancel={() => setFlow({ mode: 'method-select', plan: currentPlan })}
              />
            )}
          </div>
        )
      })()}
    </div>
  )
}
