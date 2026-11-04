'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'

type Step = 'form' | 'download' | 'error'

interface DownloadData {
  applePassUrl: string
  googleWalletUrl: string
  customerName: string
  programName: string
  stampsRequired: number
  rewardDescription: string
}

export default function RegisterPage() {
  const params = useParams()
  const slug = params.slug as string

  const [step, setStep] = useState<Step>('form')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [downloadData, setDownloadData] = useState<DownloadData | null>(null)

  const [form, setForm] = useState({ name: '', email: '', phone: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, slug }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || 'Error al registrar. Intenta de nuevo.')
        setStep('error')
        return
      }

      setDownloadData(data)
      setStep('download')
    } catch {
      setErrorMsg('Error de conexión. Intenta de nuevo.')
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'download' && downloadData) {
    return <DownloadStep data={downloadData} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Únete al programa</h1>
          <p className="text-slate-400">Regístrate y descarga tu tarjeta de fidelización</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {step === 'error' && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {errorMsg}
              <button
                onClick={() => setStep('form')}
                className="ml-2 underline font-medium"
              >
                Volver
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre completo
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition"
                placeholder="Tu nombre"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Correo electrónico
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition"
                placeholder="tu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Teléfono <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition"
                placeholder="+56 9 1234 5678"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generando tu tarjeta...
                </span>
              ) : (
                'Obtener mi tarjeta'
              )}
            </button>
          </form>

          <p className="mt-6 text-xs text-center text-gray-400">
            Al registrarte aceptas recibir comunicaciones del negocio.
          </p>
        </div>
      </div>
    </div>
  )
}

function DownloadStep({ data }: { data: DownloadData }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">¡Listo, {data.customerName.split(' ')[0]}!</h1>
          <p className="text-slate-400">Tu tarjeta está lista para descargar</p>
        </div>

        {/* Vista previa de la tarjeta */}
        <div className="bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl p-6 mb-6 border border-white/10">
          <div className="text-white/60 text-xs font-medium mb-1">PROGRAMA</div>
          <div className="text-white font-bold text-lg mb-4">{data.programName}</div>
          <div className="flex justify-between items-end">
            <div>
              <div className="text-white/60 text-xs font-medium mb-1">SELLOS NECESARIOS</div>
              <div className="text-white text-2xl font-bold">0 / {data.stampsRequired}</div>
            </div>
            <div className="text-right">
              <div className="text-white/60 text-xs font-medium mb-1">TU PREMIO</div>
              <div className="text-green-400 text-sm font-semibold max-w-32">{data.rewardDescription}</div>
            </div>
          </div>
        </div>

        {/* Botones de descarga */}
        <div className="space-y-3">
          <a
            href={data.applePassUrl}
            className="flex items-center justify-center gap-3 w-full py-4 bg-black text-white font-semibold rounded-xl hover:bg-gray-900 transition"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Agregar a Apple Wallet
          </a>

          <a
            href={data.googleWalletUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full py-4 bg-white text-gray-900 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Guardar en Google Wallet
          </a>
        </div>

        <p className="mt-6 text-center text-slate-500 text-sm">
          Presenta tu tarjeta en cada compra para acumular sellos
        </p>
      </div>
    </div>
  )
}
