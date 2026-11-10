'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const OPTIONS = [10, 25, 50, 100]

export default function PageSizeSelector({ current }: { current: number }) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('pageSize', e.target.value)
    params.set('page', '1')
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <span>Mostrar</span>
      <select
        value={current}
        onChange={handleChange}
        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
      >
        {OPTIONS.map(n => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <span>por página</span>
    </div>
  )
}
