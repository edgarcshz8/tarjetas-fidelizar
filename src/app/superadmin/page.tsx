'use client'

import { useEffect, useState, useCallback } from 'react'
import { signOut } from 'next-auth/react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Business {
  id:            string
  name:          string
  slug:          string
  createdAt:     string
  owner:         { email: string; name: string } | null
  program:       { name: string; stampsRequired: number; stampEmoji: string | null } | null
  employeeCount: number
  customerCount: number
}

interface Stats {
  totalBusinesses: number
  totalCustomers:  number
}

interface CreateResult {
  businessName: string
  slug:         string
  email:        string
  password:     string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

function randomPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [stats,      setStats]      = useState<Stats>({ totalBusinesses: 0, totalCustomers: 0 })
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [result,     setResult]     = useState<CreateResult | null>(null)

  // Form state
  const [businessName, setBusinessName] = useState('')
  const [slug,         setSlug]         = useState('')
  const [ownerName,    setOwnerName]    = useState('')
  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState(randomPassword())
  const [showPass,     setShowPass]     = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [formError,    setFormError]    = useState('')

  const fetchBusinesses = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/businesses')
      if (res.ok) {
        const data = await res.json()
        setBusinesses(data.businesses)
        setStats(data.stats)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBusinesses() }, [fetchBusinesses])

  function handleBusinessNameChange(val: string) {
    setBusinessName(val)
    setSlug(slugify(val))
  }

  function resetForm() {
    setBusinessName(''); setSlug(''); setOwnerName(''); setEmail('')
    setPassword(randomPassword()); setShowPass(false); setFormError('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError('')
    try {
      const res = await fetch('/api/superadmin/businesses', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ businessName, slug, ownerName, email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || 'Error al crear'); return }
      setResult({ businessName, slug, email, password })
      setShowForm(false)
      resetForm()
      fetchBusinesses()
    } catch {
      setFormError('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Super Admin</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestión de negocios de la plataforma</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/admin/login' })}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Salir
        </button>
      </div>

      {/* ─── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Negocios activos</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalBusinesses}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Clientes totales</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalCustomers}</p>
        </div>
      </div>

      {/* ─── Success result ─────────────────────────────────────────────────── */}
      {result && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-green-800 mb-2">✅ Negocio creado exitosamente</p>
              <div className="text-sm text-green-700 space-y-1">
                <p><span className="font-medium">Negocio:</span> {result.businessName}</p>
                <p><span className="font-medium">URL registro:</span> <code className="bg-green-100 px-1 rounded">/{result.slug}</code></p>
                <p><span className="font-medium">Email:</span> {result.email}</p>
                <p><span className="font-medium">Contraseña:</span> <code className="bg-green-100 px-2 py-0.5 rounded font-mono">{result.password}</code> <span className="text-green-600 text-xs">(guárdala, no se mostrará de nuevo)</span></p>
                <p><span className="font-medium">Panel:</span> <a href="/admin/login" className="underline">/admin/login</a></p>
              </div>
            </div>
            <button onClick={() => setResult(null)} className="text-green-500 hover:text-green-700 ml-4 text-xl leading-none">×</button>
          </div>
        </div>
      )}

      {/* ─── Create form ────────────────────────────────────────────────────── */}
      <div className="mb-6">
        {!showForm ? (
          <button
            onClick={() => { setShowForm(true); setResult(null) }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Crear negocio
          </button>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="font-semibold text-gray-900 mb-5">Nuevo negocio</h2>
            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
            )}
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del negocio</label>
                <input
                  required
                  value={businessName}
                  onChange={e => handleBusinessNameChange(e.target.value)}
                  placeholder="Café Camila"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Identificador <span className="text-gray-400 font-normal">(URL: /{slug || '...'})</span>
                </label>
                <input
                  required
                  value={slug}
                  onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="cafe-camila"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del propietario</label>
                <input
                  required
                  value={ownerName}
                  onChange={e => setOwnerName(e.target.value)}
                  placeholder="Camila González"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email del propietario</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="camila@cafecamila.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña inicial</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      required
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPass
                        ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      }
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPassword(randomPassword())}
                    className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition whitespace-nowrap"
                  >
                    Generar
                  </button>
                </div>
              </div>
              <div className="sm:col-span-2 flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition disabled:opacity-50"
                >
                  {submitting ? 'Creando...' : 'Crear negocio'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); resetForm() }}
                  className="px-5 py-2.5 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ─── Businesses table ───────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Negocios registrados</h2>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando...</div>
        ) : businesses.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No hay negocios registrados aún.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Negocio</th>
                  <th className="px-5 py-3 text-left">Propietario</th>
                  <th className="px-5 py-3 text-left">Programa</th>
                  <th className="px-4 py-3 text-right">Clientes</th>
                  <th className="px-4 py-3 text-right">Empleados</th>
                  <th className="px-5 py-3 text-left">Registrado</th>
                  <th className="px-5 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {businesses.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900">{b.name}</div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">/{b.slug}</div>
                    </td>
                    <td className="px-5 py-4">
                      {b.owner ? (
                        <>
                          <div className="text-gray-800">{b.owner.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{b.owner.email}</div>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {b.program ? (
                        <div className="flex items-center gap-1.5">
                          <span>{b.program.stampEmoji ?? '⭐'}</span>
                          <span className="text-gray-700">{b.program.stampsRequired} sellos</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">Sin programa</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right font-medium text-gray-900">{b.customerCount}</td>
                    <td className="px-4 py-4 text-right text-gray-500">{b.employeeCount}</td>
                    <td className="px-5 py-4 text-gray-500 text-xs">{formatDate(b.createdAt)}</td>
                    <td className="px-5 py-4">
                      <a
                        href={`/${b.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-600 hover:underline"
                      >
                        Ver página →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
