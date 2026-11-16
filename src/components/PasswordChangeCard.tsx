'use client'

import { useState } from 'react'

type State = 'idle' | 'saving' | 'success' | 'error'

export default function PasswordChangeCard() {
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [state,    setState]    = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm
  const tooShort = next.length > 0 && next.length < 8

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (mismatch || tooShort) return

    setState('saving')
    setErrorMsg('')

    try {
      const res = await fetch('/api/admin/account/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Error al cambiar la contraseña')
        setState('error')
        return
      }
      setState('success')
      setCurrent('')
      setNext('')
      setConfirm('')
      setTimeout(() => setState('idle'), 4000)
    } catch {
      setErrorMsg('Error de conexión')
      setState('error')
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Cambiar contraseña</h2>
      <p className="text-sm text-gray-400 mb-5">Actualiza la contraseña de tu cuenta de administrador.</p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña actual</label>
          <input
            type="password"
            required
            value={current}
            onChange={e => { setCurrent(e.target.value); if (state === 'error') setState('idle') }}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            autoComplete="current-password"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
          <input
            type="password"
            required
            value={next}
            onChange={e => { setNext(e.target.value); if (state === 'error') setState('idle') }}
            className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 ${
              tooShort ? 'border-red-400 bg-red-50' : 'border-gray-300'
            }`}
            autoComplete="new-password"
          />
          {tooShort && (
            <p className="mt-1 text-xs text-red-600">Mínimo 8 caracteres</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nueva contraseña</label>
          <input
            type="password"
            required
            value={confirm}
            onChange={e => { setConfirm(e.target.value); if (state === 'error') setState('idle') }}
            className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 ${
              mismatch ? 'border-red-400 bg-red-50' : 'border-gray-300'
            }`}
            autoComplete="new-password"
          />
          {mismatch && (
            <p className="mt-1 text-xs text-red-600">Las contraseñas no coinciden</p>
          )}
        </div>

        {state === 'error' && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            {errorMsg}
          </p>
        )}

        <div className="flex items-center gap-4 pt-1">
          <button
            type="submit"
            disabled={state === 'saving' || mismatch || tooShort}
            className="px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition disabled:opacity-50"
          >
            {state === 'saving' ? 'Guardando…' : 'Cambiar contraseña'}
          </button>

          {state === 'success' && (
            <span className="text-sm text-green-600 font-medium flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Contraseña actualizada
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
