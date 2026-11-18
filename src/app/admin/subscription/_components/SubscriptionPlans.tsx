'use client'

// SECURITY_RULES applied in this file:
//   Rule 11: Minimum PII — no card or payer data collected here; redirect to MP-hosted checkout
//   Rule 12: No CVV, PAN, or track-data referenced

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Plan {
  id: string
  name: string
  description: string
  price: number
  priceFormatted: string
  interval: 'MONTHLY' | 'ANNUAL'
  features: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Props {
  plans: Plan[]
  businessId: string
  userEmail: string
  activeSubscriptionStatus: 'PENDING' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | null
}

export default function SubscriptionPlans({ plans, businessId, userEmail, activeSubscriptionStatus }: Props) {
  const router = useRouter()
  const [mpPayerEmail, setMpPayerEmail] = useState(userEmail)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const canSubscribe =
    activeSubscriptionStatus === null ||
    activeSubscriptionStatus === 'CANCELLED' ||
    activeSubscriptionStatus === 'PAST_DUE' ||
    activeSubscriptionStatus === 'TRIALING' ||
    activeSubscriptionStatus === 'PENDING'

  async function handleSubscribe(planId: string) {
    const trimmedEmail = mpPayerEmail.trim()
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError('Ingresa un email válido antes de continuar.')
      return
    }
    setEmailError(null)
    setLoadingPlanId(planId)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Rule 11: email sent only to identify payer's MP account; never stored client-side
        body: JSON.stringify({ planId, businessId, mpPayerEmail: trimmedEmail }),
      })
      const data = (await res.json()) as { init_point?: string; error?: string }
      if (!res.ok || !data.init_point) {
        setErrorMsg(data.error ?? 'No se pudo iniciar el pago. Intenta de nuevo.')
        return
      }
      // Redirect to Mercado Pago hosted checkout — Rule 11 (no card data handled client-side)
      router.push(data.init_point)
    } catch {
      setErrorMsg('Error de red. Verifica tu conexión e intenta de nuevo.')
    } finally {
      setLoadingPlanId(null)
    }
  }

  if (plans.length === 0) {
    return (
      <p className="text-gray-400 text-center py-16">
        No hay planes disponibles en este momento.
      </p>
    )
  }

  return (
    <div>
      {/* MP payer email — shown only when user can initiate a checkout */}
      {canSubscribe && (
        <div className="mb-6">
          <label htmlFor="mp-payer-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email de tu cuenta Mercado Pago
          </label>
          <input
            id="mp-payer-email"
            type="email"
            value={mpPayerEmail}
            onChange={(e) => { setMpPayerEmail(e.target.value); setEmailError(null); setErrorMsg(null) }}
            placeholder="tu@email.com"
            className="w-full md:w-96 px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Debe ser el email con el que inicias sesión en Mercado Pago Chile
          </p>
          {emailError && (
            <p className="mt-1 text-xs text-red-600">{emailError}</p>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {errorMsg}
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
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
                    <span className="mt-0.5 text-green-500 font-bold" aria-hidden>
                      &#10003;
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => handleSubscribe(plan.id)}
              disabled={!canSubscribe || loadingPlanId !== null}
              className="mt-auto w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingPlanId === plan.id
                ? 'Procesando...'
                : activeSubscriptionStatus === 'TRIALING' || activeSubscriptionStatus === 'PENDING'
                  ? 'Reintentar pago'
                  : 'Suscribirse'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
