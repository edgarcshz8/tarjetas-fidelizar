'use client'

import { useState, useEffect, useRef } from 'react'

type ScanState = 'idle' | 'scanning' | 'processing' | 'success' | 'error' | 'reward'

interface ScanResult {
  currentStamps: number
  stampsRequired: number
  rewardReady: boolean
  customerName: string
  message: string
}

export default function QRScannerClient() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<ScanState>('idle')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState('')
  const [manualSerial, setManualSerial] = useState('')
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState<boolean | null>(null)

  useEffect(() => {
    setHasBarcodeDetector('BarcodeDetector' in window)
    return () => { stopCamera() }
  }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream

      // El <video> siempre está en el DOM (oculto en idle), así que el ref
      // siempre existe aquí. Asignamos srcObject ANTES de setState para
      // evitar la condición de carrera donde el elemento aún no existe.
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }

      setState('scanning')
      startScanning()
    } catch {
      setError('No se pudo acceder a la cámara. Verifica los permisos del navegador.')
      setState('error')
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  function startScanning() {
    if (!('BarcodeDetector' in window)) return

    const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })

    const scan = async () => {
      if (!videoRef.current || !streamRef.current) return
      try {
        const barcodes = await detector.detect(videoRef.current)
        if (barcodes.length > 0) {
          await processSerial(barcodes[0].rawValue)
        } else {
          requestAnimationFrame(scan)
        }
      } catch {
        requestAnimationFrame(scan)
      }
    }
    requestAnimationFrame(scan)
  }

  async function processSerial(serial: string) {
    setState('processing')
    stopCamera()

    try {
      const res = await fetch('/api/stamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNumber: serial }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al agregar sello')
        setState('error')
        return
      }

      setResult(data)
      setState(data.rewardReady ? 'reward' : 'success')
    } catch {
      setError('Error de conexión')
      setState('error')
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!manualSerial.trim()) return
    await processSerial(manualSerial.trim())
  }

  function reset() {
    stopCamera()
    setState('idle')
    setResult(null)
    setError('')
    setManualSerial('')
  }

  // ─── Estados finales ───────────────────────────────────────────────────────

  if (state === 'success' && result) {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">¡Sello Agregado!</h2>
          <p className="text-gray-600 mb-4">{result.message}</p>
          <StampProgress current={result.currentStamps} required={result.stampsRequired} />
          <button
            onClick={reset}
            className="mt-6 w-full py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition"
          >
            Escanear Siguiente
          </button>
        </div>
      </div>
    )
  }

  if (state === 'reward' && result) {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-green-50 border-2 border-green-400 rounded-2xl p-8 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-green-800 mb-2">¡Premio Completado!</h2>
          <p className="text-green-700 font-medium mb-2">{result.customerName}</p>
          <p className="text-green-600 text-sm mb-6">{result.message}</p>
          <RedeemButton serial={manualSerial} onDone={reset} />
          <button onClick={reset} className="mt-3 w-full py-2 text-green-700 text-sm underline">
            Canjear después
          </button>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-8 text-center">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-red-600 mb-6">{error}</p>
          <button
            onClick={reset}
            className="w-full py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition"
          >
            Intentar de nuevo
          </button>
        </div>
      </div>
    )
  }

  if (state === 'processing') {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-gray-600">Procesando...</p>
        </div>
      </div>
    )
  }

  // ─── Estado idle / scanning ───────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Cámara */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        {/* Video: SIEMPRE en el DOM para que videoRef esté disponible al llamar
            startCamera(). Se oculta con 'hidden' cuando no estamos escaneando. */}
        <div className={state === 'scanning' ? 'relative' : 'hidden'}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full aspect-square object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-4 border-white rounded-2xl opacity-70" />
          </div>
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <p className="text-white text-sm font-medium drop-shadow">
              {hasBarcodeDetector
                ? 'Apunta al QR de la tarjeta del cliente'
                : 'Cámara activa — usa el ingreso manual para agregar el serial'}
            </p>
          </div>
        </div>

        {/* Panel idle */}
        {state === 'idle' && (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">📷</div>
            <h3 className="font-semibold text-gray-900 mb-2">Escanear QR del cliente</h3>
            {hasBarcodeDetector === false ? (
              <p className="text-amber-600 text-sm mb-6">
                Tu navegador no soporta lectura de QR automática.<br />
                Usa el ingreso manual con el serial del pase.
              </p>
            ) : (
              <p className="text-gray-500 text-sm mb-6">
                Activa la cámara para escanear automáticamente,<br />
                o ingresa el serial manualmente.
              </p>
            )}
            <button
              onClick={startCamera}
              className="w-full py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition"
            >
              Activar Cámara
            </button>
          </div>
        )}
      </div>

      {/* Input manual */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 mb-1">Ingreso Manual</h3>
        <p className="text-gray-500 text-sm mb-4">Ingresa el serial del pase del cliente</p>
        <form onSubmit={handleManualSubmit} className="flex gap-3">
          <input
            type="text"
            value={manualSerial}
            onChange={e => setManualSerial(e.target.value)}
            placeholder="Serial del pase..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
          />
          <button
            type="submit"
            disabled={!manualSerial.trim()}
            className="px-5 py-2 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition disabled:opacity-50"
          >
            Agregar
          </button>
        </form>
      </div>
    </div>
  )
}

function StampProgress({ current, required }: { current: number; required: number }) {
  const pct = Math.min((current / required) * 100, 100)
  return (
    <div className="mt-4">
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{current} sellos</span>
        <span>{required} para premio</span>
      </div>
      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-slate-700 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function RedeemButton({ serial, onDone }: { serial: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false)

  async function handleRedeem() {
    setLoading(true)
    await fetch('/api/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serialNumber: serial }),
    })
    setLoading(false)
    onDone()
  }

  return (
    <button
      onClick={handleRedeem}
      disabled={loading}
      className="w-full py-3 bg-green-700 text-white font-bold rounded-xl hover:bg-green-800 transition disabled:opacity-50"
    >
      {loading ? 'Canjeando...' : '🎁 Canjear Premio Ahora'}
    </button>
  )
}
