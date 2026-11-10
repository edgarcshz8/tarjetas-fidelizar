'use client'

import { useState } from 'react'
import { Business, LoyaltyProgram } from '@prisma/client'

interface Props {
  business: Business | null
  program: LoyaltyProgram | null
}

interface ProgramState {
  id: string
  name: string
  description: string
  stampsRequired: number
  rewardDescription: string
  stampIconUrl: string
  stampEmoji: string
  backgroundColor: string
  foregroundColor: string
  labelColor: string
}

type FormSection = 'programa' | 'diseno' | 'negocio'
type PreviewPlatform = 'apple' | 'google'

const STAMP_ICONS = [
  '☕', '🍕', '🍔', '🌮', '🍜', '🍣',
  '🧋', '🍺', '🍰', '🥗', '🌸', '🎪',
  '⭐', '🌟', '🏆', '💎', '🎯', '❤️',
  '🔥', '🎁', '👑', '✨', '🦋', '🎵',
]

const COLOR_THEMES = [
  { name: 'Noche',   bg: '#1a1a2e', fg: '#ffffff', label: '#aaaacc' },
  { name: 'Café',    bg: '#3b1f0d', fg: '#ffd7a0', label: '#c4906a' },
  { name: 'Bosque',  bg: '#0d3d2e', fg: '#a8f0c6', label: '#5dba90' },
  { name: 'Navy',    bg: '#0f2444', fg: '#e0f0ff', label: '#7ab0d8' },
  { name: 'Vino',    bg: '#4a0a26', fg: '#ffd6e7', label: '#d47090' },
  { name: 'Pizarra', bg: '#2d3436', fg: '#dfe6e9', label: '#8fa0a8' },
  { name: 'Oliva',   bg: '#1e3a1e', fg: '#d4edda', label: '#7aaa7a' },
  { name: 'Rubí',    bg: '#8b0000', fg: '#ffe4e4', label: '#d08080' },
]

export default function SettingsForm({ business, program }: Props) {
  const [programData, setProgramData] = useState<ProgramState>({
    id:               program?.id               ?? '',
    name:             program?.name             ?? '',
    description:      program?.description      ?? '',
    stampsRequired:   program?.stampsRequired   ?? 10,
    rewardDescription:program?.rewardDescription ?? '',
    stampIconUrl:     program?.stampIconUrl      ?? '',
    stampEmoji:       program?.stampEmoji        ?? '⭐',
    backgroundColor:  program?.backgroundColor  ?? '#1a1a2e',
    foregroundColor:  program?.foregroundColor  ?? '#ffffff',
    labelColor:       program?.labelColor       ?? '#aaaacc',
  })

  const [businessData, setBusinessData] = useState({
    name:         business?.name         ?? '',
    slug:         business?.slug         ?? '',
    latitude:     business?.latitude     ?? null as number | null,
    longitude:    business?.longitude    ?? null as number | null,
    locationName: business?.locationName ?? '',
  })
  const [geoLoading, setGeoLoading] = useState(false)

  const [section,       setSection]       = useState<FormSection>('programa')
  const [platform,      setPlatform]      = useState<PreviewPlatform>('apple')
  const [previewStamps, setPreviewStamps] = useState(
    Math.max(1, Math.floor((program?.stampsRequired ?? 10) / 3))
  )
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState('')

  const p = programData

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)

    try {
      const [progRes] = await Promise.all([
        fetch('/api/admin/programs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(programData),
        }),
        fetch('/api/admin/businesses', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:         businessData.name,
            latitude:     businessData.latitude,
            longitude:    businessData.longitude,
            locationName: businessData.locationName || null,
          }),
        }),
      ])

      if (!progRes.ok) {
        const data = await progRes.json()
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

  return (
    <form onSubmit={handleSave}>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">

        {/* ─── Left: form ─────────────────────────── */}
        <div className="xl:col-span-3 space-y-4">

          {/* Section tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['programa', 'diseno', 'negocio'] as FormSection[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                  section === s
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s === 'programa' ? 'Programa' : s === 'diseno' ? 'Diseño' : 'Negocio'}
              </button>
            ))}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* ── Programa ── */}
          {section === 'programa' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
              <Field label="Nombre del programa">
                <input
                  type="text"
                  required
                  value={p.name}
                  onChange={e => setProgramData(d => ({ ...d, name: e.target.value }))}
                  className="input"
                  placeholder="Ej: Tarjeta Café & Club"
                />
              </Field>

              <Field label="Descripción" hint="Se muestra en el reverso de la tarjeta">
                <input
                  type="text"
                  value={p.description}
                  onChange={e => setProgramData(d => ({ ...d, description: e.target.value }))}
                  className="input"
                  placeholder="Ej: ¡Colecciona sellos y gana un café gratis!"
                />
              </Field>

              <Field label={`Sellos para el premio — ${p.stampsRequired}`}>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="3" max="20" step="1"
                    value={p.stampsRequired}
                    onChange={e => {
                      const n = parseInt(e.target.value)
                      setProgramData(d => ({ ...d, stampsRequired: n }))
                      setPreviewStamps(prev => Math.min(prev, n))
                    }}
                    className="flex-1 accent-slate-900"
                  />
                  <span className="text-3xl font-bold text-slate-900 w-12 text-right tabular-nums select-none">
                    {p.stampsRequired}
                  </span>
                </div>
              </Field>

              <Field label="Premio al completar la tarjeta">
                <input
                  type="text"
                  required
                  value={p.rewardDescription}
                  onChange={e => setProgramData(d => ({ ...d, rewardDescription: e.target.value }))}
                  className="input"
                  placeholder="Ej: 1 café de tu elección completamente gratis"
                />
              </Field>
            </div>
          )}

          {/* ── Diseño ── */}
          {section === 'diseno' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">

              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Colores de la tarjeta</p>
                <ColorRow
                  label="Color de fondo"
                  description="Color principal que rellena la tarjeta"
                  value={p.backgroundColor}
                  onChange={v => setProgramData(d => ({ ...d, backgroundColor: v }))}
                />
                <ColorRow
                  label="Color de texto"
                  description="Nombre del negocio, valores y números"
                  value={p.foregroundColor}
                  onChange={v => setProgramData(d => ({ ...d, foregroundColor: v }))}
                />
                <ColorRow
                  label="Color de etiquetas"
                  description="Texto pequeño: SELLOS, PREMIO, COMPLETAR…"
                  value={p.labelColor}
                  onChange={v => setProgramData(d => ({ ...d, labelColor: v }))}
                />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Temas rápidos</p>
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_THEMES.map(t => (
                    <button
                      key={t.name}
                      type="button"
                      title={t.name}
                      onClick={() => setProgramData(d => ({
                        ...d,
                        backgroundColor: t.bg,
                        foregroundColor: t.fg,
                        labelColor: t.label,
                      }))}
                      className="relative rounded-xl overflow-hidden h-16 border-2 border-transparent hover:border-slate-400 transition focus:outline-none focus:border-slate-500"
                      style={{ backgroundColor: t.bg }}
                    >
                      <div className="absolute inset-x-3 top-3 space-y-1">
                        <div className="h-1.5 rounded-full" style={{ background: t.fg, opacity: 0.9 }} />
                        <div className="h-1 w-3/4 rounded-full" style={{ background: t.label, opacity: 0.75 }} />
                      </div>
                      <span
                        className="absolute bottom-1.5 left-0 right-0 text-center text-[10px] font-semibold"
                        style={{ color: t.label }}
                      >
                        {t.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Ícono de cada sello
                </p>
                <p className="text-xs text-gray-400 mb-3">
                  Aparece en cada círculo de la tarjeta web y en la vista previa
                </p>
                <div className="grid grid-cols-6 gap-1.5">
                  {STAMP_ICONS.map(icon => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setProgramData(d => ({ ...d, stampEmoji: icon }))}
                      className={`h-10 rounded-xl text-xl flex items-center justify-center transition border-2 ${
                        p.stampEmoji === icon
                          ? 'border-slate-900 bg-slate-50 scale-110 shadow-sm'
                          : 'border-transparent bg-gray-50 hover:bg-gray-100 hover:border-gray-300'
                      }`}
                      title={icon}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <Field
                label="URL del logo / ícono"
                hint="Imagen cuadrada PNG que aparece en la esquina superior de Apple Wallet"
              >
                <input
                  type="text"
                  value={p.stampIconUrl}
                  onChange={e => setProgramData(d => ({ ...d, stampIconUrl: e.target.value }))}
                  className="input text-sm"
                  placeholder="https://... o /uploads/logo.png"
                />
              </Field>
            </div>
          )}

          {/* ── Negocio ── */}
          {section === 'negocio' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
              <Field label="Nombre del negocio">
                <input
                  type="text"
                  value={businessData.name}
                  onChange={e => setBusinessData(d => ({ ...d, name: e.target.value }))}
                  className="input"
                />
              </Field>
              <Field
                label="URL de registro de clientes"
                hint="El slug no se puede cambiar. Comparte esta URL con tus clientes."
              >
                <div className="flex items-center px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono text-gray-600 select-all">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/{businessData.slug}
                </div>
              </Field>

              {/* ── Ubicación del negocio (geofencing) ── */}
              <div className="border-t border-gray-100 pt-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-700">Ubicación del negocio</p>
                  <button
                    type="button"
                    disabled={geoLoading}
                    onClick={() => {
                      if (!navigator.geolocation) return
                      setGeoLoading(true)
                      navigator.geolocation.getCurrentPosition(
                        pos => {
                          setBusinessData(d => ({
                            ...d,
                            latitude:  Math.round(pos.coords.latitude  * 1e6) / 1e6,
                            longitude: Math.round(pos.coords.longitude * 1e6) / 1e6,
                          }))
                          setGeoLoading(false)
                        },
                        () => setGeoLoading(false),
                      )
                    }}
                    className="text-xs text-slate-600 font-medium underline underline-offset-2 hover:text-slate-900 disabled:opacity-50"
                  >
                    {geoLoading ? 'Obteniendo…' : '📍 Usar mi ubicación actual'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Cuando el cliente esté cerca, la tarjeta aparece automáticamente en su pantalla de bloqueo (Apple y Google Wallet).
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitud">
                    <input
                      type="number"
                      step="0.000001"
                      min="-90" max="90"
                      value={businessData.latitude ?? ''}
                      onChange={e => setBusinessData(d => ({
                        ...d,
                        latitude: e.target.value ? parseFloat(e.target.value) : null,
                      }))}
                      className="input text-sm"
                      placeholder="Ej: -33.447487"
                    />
                  </Field>
                  <Field label="Longitud">
                    <input
                      type="number"
                      step="0.000001"
                      min="-180" max="180"
                      value={businessData.longitude ?? ''}
                      onChange={e => setBusinessData(d => ({
                        ...d,
                        longitude: e.target.value ? parseFloat(e.target.value) : null,
                      }))}
                      className="input text-sm"
                      placeholder="Ej: -70.673676"
                    />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="Texto de notificación" hint="Mensaje que ve el cliente al acercarse">
                    <input
                      type="text"
                      value={businessData.locationName}
                      onChange={e => setBusinessData(d => ({ ...d, locationName: e.target.value }))}
                      className="input"
                      placeholder={`¡Visita ${businessData.name || 'el negocio'}!`}
                    />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* Save */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {saved && (
              <span className="text-green-600 text-sm font-medium flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Guardado correctamente
              </span>
            )}
          </div>
        </div>

        {/* ─── Right: live preview ─────────────────── */}
        <div className="xl:col-span-2 xl:sticky xl:top-6 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Vista previa en tiempo real</h3>

            {/* Platform tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5">
              {(['apple', 'google'] as PreviewPlatform[]).map(pl => (
                <button
                  key={pl}
                  type="button"
                  onClick={() => setPlatform(pl)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
                    platform === pl ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {pl === 'apple' ? '🍎 Apple Wallet' : '📱 Google Wallet'}
                </button>
              ))}
            </div>

            {/* Card preview */}
            <div className="flex justify-center py-2">
              {platform === 'apple' ? (
                <AppleWalletCard
                  businessName={businessData.name}
                  stampsRequired={p.stampsRequired}
                  rewardDescription={p.rewardDescription}
                  bgColor={p.backgroundColor}
                  fgColor={p.foregroundColor}
                  labelColor={p.labelColor}
                  logoUrl={p.stampIconUrl}
                  stampEmoji={p.stampEmoji}
                  currentStamps={previewStamps}
                />
              ) : (
                <GoogleWalletCard
                  businessName={businessData.name}
                  programName={p.name}
                  stampsRequired={p.stampsRequired}
                  rewardDescription={p.rewardDescription}
                  bgColor={p.backgroundColor}
                  fgColor={p.foregroundColor}
                  labelColor={p.labelColor}
                  stampEmoji={p.stampEmoji}
                  logoUrl={p.stampIconUrl}
                  currentStamps={previewStamps}
                />
              )}
            </div>

            {/* Stamp preview slider */}
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">Simular sellos</span>
                <span className="text-xs font-bold text-slate-700 tabular-nums">
                  {previewStamps} / {p.stampsRequired}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max={p.stampsRequired}
                value={previewStamps}
                onChange={e => setPreviewStamps(parseInt(e.target.value))}
                className="w-full accent-slate-900"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>Sin sellos</span>
                <span>Premio listo 🎉</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center px-2">
            El diseño puede variar ligeramente según la versión de iOS / Android del cliente.
          </p>
        </div>
      </div>

      {/* Tailwind utility so "input" class works in JSX */}
      <style jsx global>{`
        .input {
          width: 100%;
          padding: 0.625rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 0.75rem;
          font-size: 0.875rem;
          transition: box-shadow 0.15s;
        }
        .input:focus {
          outline: none;
          box-shadow: 0 0 0 2px #64748b;
        }
      `}</style>
    </form>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Field({
  label, hint, children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function ColorRow({
  label, description, value, onChange,
}: {
  label: string
  description: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 flex-shrink-0"
        style={{ backgroundColor: value }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-700">{label}</div>
        <div className="text-xs text-gray-400">{description}</div>
      </div>
      <input
        type="text"
        value={value}
        maxLength={7}
        onChange={e => {
          const v = e.target.value
          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v)
        }}
        className="w-[4.5rem] px-2 py-1.5 text-xs border border-gray-200 rounded-lg font-mono text-gray-600 focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
    </div>
  )
}

// ─── Apple Wallet card mockup ─────────────────────────────────────────────────

function AppleWalletCard({
  businessName, stampsRequired, rewardDescription,
  bgColor, fgColor, labelColor, logoUrl, stampEmoji, currentStamps,
}: {
  businessName: string
  stampsRequired: number
  rewardDescription: string
  bgColor: string
  fgColor: string
  labelColor: string
  logoUrl: string
  stampEmoji: string
  currentStamps: number
}) {
  const rewardReady = currentStamps >= stampsRequired

  return (
    <div
      style={{
        width: 270,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: bgColor,
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Top row: logo + business name */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {logoUrl && logoUrl.startsWith('http') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            style={{ width: 32, height: 32, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: 7,
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>
            🏪
          </div>
        )}
        <span style={{ color: fgColor, fontSize: 14, fontWeight: 700, letterSpacing: 0.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {businessName || 'Nombre del negocio'}
        </span>
      </div>

      {/* Strip: stamp circles */}
      <div style={{ padding: '4px 14px 12px', background: bgColor }}>
        <WalletStampStrip
          current={currentStamps}
          total={stampsRequired}
          fgColor={fgColor}
          stampEmoji={stampEmoji}
          rewardReady={rewardReady}
        />
      </div>

      {/* Primary field row */}
      <div style={{ padding: '0 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ color: labelColor, fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            {rewardReady ? 'PREMIO DISPONIBLE' : 'SELLOS'}
          </div>
          <div style={{ color: fgColor, fontSize: 26, fontWeight: 700, lineHeight: 1.1, marginTop: 2 }}>
            {rewardReady ? '🎉' : `${currentStamps} / ${stampsRequired}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: labelColor, fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            TITULAR
          </div>
          <div style={{ color: fgColor, fontSize: 11, fontWeight: 500, marginTop: 2 }}>
            Nombre Cliente
          </div>
        </div>
      </div>

      {/* Secondary fields */}
      <div style={{ padding: '0 16px 14px', display: 'flex', gap: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: labelColor, fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            PREMIO
          </div>
          <div style={{
            color: fgColor, fontSize: 10, fontWeight: 500, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {rewardDescription || 'Tu premio aquí'}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <div style={{ color: labelColor, fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            COMPLETAR
          </div>
          <div style={{ color: fgColor, fontSize: 10, fontWeight: 500, marginTop: 2 }}>
            {stampsRequired} sellos
          </div>
        </div>
      </div>

      {/* QR code */}
      <div style={{
        background: 'white',
        margin: '0 14px 16px',
        borderRadius: 10,
        padding: '10px 10px 6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
      }}>
        <QRCodePlaceholder size={72} />
        <span style={{ fontSize: 8, color: '#888', letterSpacing: 0.8, textTransform: 'uppercase' }}>
          Escanear en tienda
        </span>
      </div>
    </div>
  )
}

function WalletStampStrip({
  current, total, fgColor, stampEmoji, rewardReady,
}: {
  current: number
  total: number
  fgColor: string
  stampEmoji: string
  rewardReady: boolean
}) {
  const n         = total
  const singleRow = n <= 5
  const perRow1   = singleRow ? n : Math.ceil(n / 2)
  const perRow2   = singleRow ? 0 : Math.floor(n / 2)

  const r       = Math.min(11, Math.floor(220 / (perRow1 * 2.5)))
  const gap     = r * 0.6
  const rowGap  = r * 1.0
  const rowW    = (count: number) => count * 2 * r + (count - 1) * gap
  const svgW    = rowW(perRow1) + 4
  const svgH    = singleRow ? 2 * r + 4 : 2 * (2 * r) + rowGap + 4
  const emojiSz = r * 1.15

  function StampRow({ count, offset, cy }: { count: number; offset: number; cy: number }) {
    // center this row horizontally within svgW
    const rowStart = (svgW - rowW(count)) / 2 + r
    return (
      <>
        {Array.from({ length: count }).map((_, i) => {
          const cx     = rowStart + i * (2 * r + gap)
          const earned = (offset + i) < current
          return (
            <g key={i}>
              {earned ? (
                <circle cx={cx} cy={cy} r={r} fill={fgColor} />
              ) : (
                <circle cx={cx} cy={cy} r={r - 1.5} fill="none" stroke={fgColor} strokeWidth="1.5" strokeOpacity="0.35" />
              )}
              <text x={cx} y={cy + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize={emojiSz} opacity={earned ? 1 : 0.3}>
                {rewardReady ? '🏆' : stampEmoji}
              </text>
            </g>
          )
        })}
      </>
    )
  }

  const cy1 = 2 + r
  const cy2 = 2 + r + 2 * r + rowGap

  return (
    <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: 'block', overflow: 'visible' }}>
      <StampRow count={perRow1} offset={0}       cy={cy1} />
      {perRow2 > 0 && <StampRow count={perRow2} offset={perRow1} cy={cy2} />}
      {total > 10 && (
        <text x={svgW - 2} y={svgH / 2} textAnchor="end" dominantBaseline="middle" fontSize={9} fill={fgColor} fillOpacity="0.6">
          +{total - 10}
        </text>
      )}
    </svg>
  )
}

function QRCodePlaceholder({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" shapeRendering="crispEdges">
      <rect width="21" height="21" fill="white" />

      {/* Top-left finder */}
      <rect x="0" y="0" width="7" height="7" fill="#111" />
      <rect x="1" y="1" width="5" height="5" fill="white" />
      <rect x="2" y="2" width="3" height="3" fill="#111" />

      {/* Top-right finder */}
      <rect x="14" y="0" width="7" height="7" fill="#111" />
      <rect x="15" y="1" width="5" height="5" fill="white" />
      <rect x="16" y="2" width="3" height="3" fill="#111" />

      {/* Bottom-left finder */}
      <rect x="0" y="14" width="7" height="7" fill="#111" />
      <rect x="1" y="15" width="5" height="5" fill="white" />
      <rect x="2" y="16" width="3" height="3" fill="#111" />

      {/* Timing patterns */}
      {[8, 10, 12].map(x => <rect key={`h${x}`} x={x} y="6" width="1" height="1" fill="#111" />)}
      {[8, 10, 12].map(y => <rect key={`v${y}`} x="6" y={y} width="1" height="1" fill="#111" />)}

      {/* Data modules */}
      {[
        [8,8],[9,8],[10,8],[12,8],[13,8],
        [8,9],[10,9],[12,9],
        [9,10],[11,10],[13,10],
        [8,11],[9,11],[11,11],[12,11],
        [10,12],[11,12],[13,12],
        [8,13],[9,13],[12,13],
        [14,8],[16,8],[18,8],[20,8],
        [15,9],[17,9],[19,9],
        [14,10],[16,10],[18,10],[20,10],
        [15,11],[17,11],
        [14,12],[16,12],[19,12],
        [8,14],[10,14],[12,14],[13,14],
        [9,15],[11,15],[13,15],
        [8,16],[10,16],[11,16],
        [9,17],[12,17],[13,17],
        [8,18],[10,18],[12,18],
        [9,19],[11,19],[13,19],
        [8,20],[10,20],[11,20],[12,20],
      ].map(([x, y]) => (
        <rect key={`d${x}${y}`} x={x} y={y} width="1" height="1" fill="#111" />
      ))}
    </svg>
  )
}

// ─── Google Wallet card mockup ────────────────────────────────────────────────

function GoogleWalletCard({
  businessName, programName, stampsRequired, rewardDescription,
  bgColor, fgColor, labelColor, stampEmoji, logoUrl, currentStamps,
}: {
  businessName: string
  programName: string
  stampsRequired: number
  rewardDescription: string
  bgColor: string
  fgColor: string
  labelColor: string
  stampEmoji: string
  logoUrl: string
  currentStamps: number
}) {
  const rewardReady = currentStamps >= stampsRequired
  const n           = stampsRequired

  return (
    <div
      style={{
        width: 270,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: bgColor,
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        fontFamily: '"Google Sans", Roboto, sans-serif',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 18px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
          <div style={{ color: labelColor, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
            PROGRAMA DE FIDELIZACIÓN
          </div>
          <div style={{ color: fgColor, fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {businessName || 'Nombre negocio'}
          </div>
          <div style={{ color: labelColor, fontSize: 10, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {programName || 'Tarjeta de sellos'}
          </div>
        </div>
        {logoUrl && logoUrl.startsWith('http') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0,
          }}>
            🏪
          </div>
        )}
      </div>

      {/* Stamp grid */}
      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 18px 12px' }}>
        <div style={{ color: labelColor, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          {rewardReady ? '🎉 PREMIO LISTO' : 'SELLOS'}
        </div>
        {rewardReady ? (
          <div style={{ color: fgColor, fontSize: 14, fontWeight: 600 }}>¡Reclama tu premio!</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Array.from({ length: n }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 24, height: 24,
                  borderRadius: '50%',
                  background: i < currentStamps ? fgColor : 'transparent',
                  border: i < currentStamps ? 'none' : `1.5px solid ${fgColor}`,
                  opacity: i < currentStamps ? 1 : 0.35,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13,
                }}
              >
                {stampEmoji}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress + reward */}
      <div style={{ padding: '12px 18px 14px' }}>
        <div style={{ color: labelColor, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>
          PROGRESO
        </div>
        <div style={{ color: fgColor, fontSize: 12, fontWeight: 600, marginTop: 2, marginBottom: 10 }}>
          {rewardReady
            ? '¡Completaste todos los sellos!'
            : `${currentStamps} de ${stampsRequired} — faltan ${stampsRequired - currentStamps}`}
        </div>

        <div style={{ borderTop: `1px solid rgba(255,255,255,0.15)`, paddingTop: 10 }}>
          <div style={{ color: labelColor, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>
            TU PREMIO
          </div>
          <div style={{ color: fgColor, fontSize: 12, fontWeight: 600, marginTop: 2 }}>
            {rewardDescription || 'Tu premio aquí'}
          </div>
        </div>
      </div>

      {/* QR code */}
      <div style={{
        background: 'white',
        margin: '0 14px 16px',
        borderRadius: 10,
        padding: '10px 10px 6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
      }}>
        <QRCodePlaceholder size={72} />
        <span style={{ fontSize: 8, color: '#888', letterSpacing: 0.8, textTransform: 'uppercase' }}>
          Escanear en tienda
        </span>
      </div>
    </div>
  )
}
