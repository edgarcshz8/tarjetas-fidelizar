'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGift, faCheck, faSpinner } from '@fortawesome/free-solid-svg-icons'

interface Props {
  serialNumber: string
  customerName: string
}

export default function RedeemButton({ serialNumber, customerName }: Props) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleRedeem() {
    setState('loading')
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNumber }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Error al canjear')
      }
      setState('done')
      router.refresh()
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error desconocido')
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
        <FontAwesomeIcon icon={faCheck} className="w-3 h-3" /> Canjeado
      </span>
    )
  }

  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
        {errorMsg}
      </span>
    )
  }

  if (state === 'confirm') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600">¿Canjear a {customerName}?</span>
        <button
          onClick={handleRedeem}
          className="px-2 py-1 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition"
        >
          Sí
        </button>
        <button
          onClick={() => setState('idle')}
          className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition"
        >
          No
        </button>
      </div>
    )
  }

  if (state === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
        <FontAwesomeIcon icon={faSpinner} className="w-3 h-3 animate-spin" /> Canjeando…
      </span>
    )
  }

  // idle
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
        <FontAwesomeIcon icon={faGift} className="w-3 h-3" /> Premio listo
      </span>
      <button
        onClick={() => setState('confirm')}
        className="px-2 py-1 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition"
      >
        Canjear
      </button>
    </div>
  )
}
