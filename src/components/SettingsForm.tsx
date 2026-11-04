'use client'

import { useState } from 'react'
import { Business, LoyaltyProgram } from '@prisma/client'

interface Props {
  business: Business | null
  program: LoyaltyProgram | null
}

export default function SettingsForm({ business, program }: Props) {
  const [programData, setProgramData] = useState({
    id: program?.id || '',
    name: program?.name || '',
    description: program?.description || '',
    stampsRequired: program?.stampsRequired || 10,
    rewardDescription: program?.rewardDescription || '',
    stampIconUrl: program?.stampIconUrl || '',
    rewardIconUrl: program?.rewardIconUrl || '',
    backgroundColor: program?.backgroundColor || '#1a1a2e',
    foregroundColor: program?.foregroundColor || '#ffffff',
    labelColor: program?.labelColor || '#cccccc',
  })

  const [businessData, setBusinessData] = useState({
    name: business?.name || '',
    primaryColor: business?.primaryColor || '#1a1a2e',
  })

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function saveProgram(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)

    try {
      const res = await fetch('/api/admin/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(programData),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al guardar')
        return
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  async function saveBusiness() {
    await fetch('/api/admin/businesses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(businessData),
    })
  }

  return (
    <div className="space-y-6">
      {/* Programa de fidelización */}
      <form onSubmit={saveProgram}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Programa de Fidelización</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del programa
              </label>
              <input
                type="text"
                required
                value={programData.name}
                onChange={e => setProgramData(d => ({ ...d, name: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500"
                placeholder="Ej: Tarjeta Café & Club"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción (opcional)
              </label>
              <input
                type="text"
                value={programData.description}
                onChange={e => setProgramData(d => ({ ...d, description: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500"
                placeholder="Ej: ¡Colecciona sellos y gana un café gratis!"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cantidad de sellos para el premio
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={programData.stampsRequired}
                  onChange={e => setProgramData(d => ({ ...d, stampsRequired: parseInt(e.target.value) }))}
                  className="flex-1"
                />
                <span className="text-2xl font-bold text-slate-900 w-10 text-right">
                  {programData.stampsRequired}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción del premio
              </label>
              <input
                type="text"
                required
                value={programData.rewardDescription}
                onChange={e => setProgramData(d => ({ ...d, rewardDescription: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500"
                placeholder="Ej: 1 café de tu elección completamente gratis"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL del ícono de sello (opcional)
              </label>
              <input
                type="text"
                value={programData.stampIconUrl}
                onChange={e => setProgramData(d => ({ ...d, stampIconUrl: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500"
                placeholder="/uploads/sello-cafe.png o URL externa"
              />
              <p className="mt-1 text-xs text-gray-400">
                Ícono PNG 29x29px que aparece en Apple Wallet
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL del ícono de premio (opcional)
              </label>
              <input
                type="text"
                value={programData.rewardIconUrl}
                onChange={e => setProgramData(d => ({ ...d, rewardIconUrl: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500"
                placeholder="/uploads/premio.png o URL externa"
              />
            </div>

            {/* Colores */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Colores de la tarjeta</p>
              <div className="grid grid-cols-3 gap-4">
                <ColorPicker
                  label="Fondo"
                  value={programData.backgroundColor}
                  onChange={v => setProgramData(d => ({ ...d, backgroundColor: v }))}
                />
                <ColorPicker
                  label="Texto"
                  value={programData.foregroundColor}
                  onChange={v => setProgramData(d => ({ ...d, foregroundColor: v }))}
                />
                <ColorPicker
                  label="Etiquetas"
                  value={programData.labelColor}
                  onChange={v => setProgramData(d => ({ ...d, labelColor: v }))}
                />
              </div>
            </div>

            {/* Vista previa */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Vista previa de la tarjeta</p>
              <div
                className="rounded-xl p-5 shadow-md"
                style={{ backgroundColor: programData.backgroundColor }}
              >
                <p style={{ color: programData.labelColor }} className="text-xs font-medium mb-1">
                  SELLOS
                </p>
                <p style={{ color: programData.foregroundColor }} className="text-3xl font-bold mb-3">
                  0 / {programData.stampsRequired}
                </p>
                <p style={{ color: programData.labelColor }} className="text-xs font-medium mb-1">
                  PREMIO
                </p>
                <p style={{ color: programData.foregroundColor }} className="text-sm">
                  {programData.rewardDescription || 'Tu premio aquí'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Programa'}
            </button>
            {saved && (
              <span className="text-green-600 text-sm font-medium">✓ Guardado correctamente</span>
            )}
          </div>
        </div>
      </form>

      {/* Info negocio */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-5">Información del Negocio</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del negocio</label>
            <input
              type="text"
              value={businessData.name}
              onChange={e => setBusinessData(d => ({ ...d, name: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL de registro</label>
            <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
              {process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/{business?.slug}
            </div>
          </div>
          <button
            onClick={saveBusiness}
            className="px-6 py-2 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition"
          >
            Guardar Negocio
          </button>
        </div>
      </div>
    </div>
  )
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <label className="text-xs text-gray-500">{label}</label>
      <div className="relative">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
        />
      </div>
      <span className="text-xs text-gray-400">{value}</span>
    </div>
  )
}
