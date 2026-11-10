'use client'

import { useState, useEffect, useRef } from 'react'
import jsQR from 'jsqr'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCamera,
  faCircleCheck,
  faTrophy,
  faCircleXmark,
  faSpinner,
  faGift,
} from '@fortawesome/free-solid-svg-icons'

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(false)
  const [state, setState] = useState<ScanState>('idle')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState('')
  const [manualSerial, setManualSerial] = useState('')
  const [lastSerial, setLastSerial] = useState('')

  useEffect(() => {
    return () => { stopCamera() }
  }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream

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
    scanningRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  function startScanning() {
    scanningRef.current = true

    const scan = () => {
      if (!scanningRef.current) return

      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) { requestAnimationFrame(scan); return }

      const ctx = canvas.getContext('2d')
      if (!ctx) { requestAnimationFrame(scan); return }

      if (video.readyState < video.HAVE_ENOUGH_DATA) {
        requestAnimationFrame(scan)
        return
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      })

      if (code?.data) {
        scanningRef.current = false
        processSerial(code.data)
        return
      }

      requestAnimationFrame(scan)
    }

    requestAnimationFrame(scan)
  }

  async function processSerial(serial: string) {
    await processStamp({ serialNumber: serial })
  }

  async function processStamp(payload: { serialNumber?: string; email?: string }) {
    setLastSerial(payload.serialNumber ?? payload.email ?? '')
    setState('processing')
    stopCamera()

    try {
      const res = await fetch('/api/stamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    const value = manualSerial.trim()
    if (!value) return
    if (value.includes('@')) {
      await processStamp({ email: value })
    } else {
      await processStamp({ serialNumber: value })
    }
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
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FontAwesomeIcon icon={faCircleCheck} className="w-8 h-8 text-green-500" />
          </div>
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
          <div className="w-16 h-16 bg-green-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <FontAwesomeIcon icon={faTrophy} className="w-8 h-8 text-green-700" />
          </div>
          <h2 className="text-2xl font-bold text-green-800 mb-2">¡Premio Completado!</h2>
          <p className="text-green-700 font-medium mb-2">{result.customerName}</p>
          <p className="text-green-600 text-sm mb-6">{result.message}</p>
          <RedeemButton serial={lastSerial} onDone={reset} />
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
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FontAwesomeIcon icon={faCircleXmark} className="w-8 h-8 text-red-500" />
          </div>
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
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FontAwesomeIcon icon={faSpinner} className="w-8 h-8 text-slate-600 animate-spin" />
          </div>
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

        {/* Video: siempre en el DOM para que videoRef esté disponible al iniciar */}
        <div className={state === 'scanning' ? 'relative' : 'hidden'}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full aspect-square object-cover"
          />
          {/* Canvas oculto: jsQR captura frames aquí para detectar QR */}
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-4 border-white rounded-2xl opacity-70" />
          </div>
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <p className="text-white text-sm font-medium drop-shadow">
              Apunta al QR de la tarjeta del cliente
            </p>
          </div>
        </div>

        {/* Panel idle */}
        {state === 'idle' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FontAwesomeIcon icon={faCamera} className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Escanear QR del cliente</h3>
            <p className="text-gray-500 text-sm mb-6">
              Activa la cámara para escanear automáticamente,<br />
              o ingresa el serial manualmente.
            </p>
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
        <p className="text-gray-500 text-sm mb-4">Ingresa el email con el que el cliente se registró</p>
        <form onSubmit={handleManualSubmit} className="flex gap-3">
          <input
            type="text"
            value={manualSerial}
            onChange={e => setManualSerial(e.target.value)}
            placeholder="email@cliente.com"
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
      className="w-full py-3 bg-green-700 text-white font-bold rounded-xl hover:bg-green-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {loading ? (
        <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin" />
      ) : (
        <FontAwesomeIcon icon={faGift} className="w-4 h-4" />
      )}
      {loading ? 'Canjeando...' : 'Canjear Premio Ahora'}
    </button>
  )
}
