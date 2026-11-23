'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CancelSubscriptionButton() {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleCancel() {
    setStep('loading')
    setError(null)
    try {
      const res = await fetch('/api/admin/subscription', { method: 'DELETE' })
      const data = (await res.json()) as { cancelled?: boolean; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'No se pudo cancelar. Intenta de nuevo.')
        setStep('confirm')
        return
      }
      router.refresh()
    } catch {
      setError('Error de red. Verifica tu conexión e intenta de nuevo.')
      setStep('confirm')
    }
  }

  if (step === 'idle') {
    return (
      <button
        onClick={() => setStep('confirm')}
        className="mt-3 text-sm text-red-500 hover:text-red-700 underline underline-offset-2 transition-colors"
      >
        Cancelar suscripción
      </button>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-800 mb-1">
          ¿Confirmas que quieres cancelar?
        </p>
        <p className="text-xs text-red-600 mb-3">
          Tu acceso continuará hasta el final del período actual y luego se desactivará.
        </p>
        {error && <p className="text-xs text-red-700 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
          >
            Sí, cancelar
          </button>
          <button
            onClick={() => { setStep('idle'); setError(null) }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            No, mantener
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
      <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Cancelando suscripción…
    </div>
  )
}
