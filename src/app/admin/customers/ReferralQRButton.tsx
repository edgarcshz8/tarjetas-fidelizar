'use client'

import { useState } from 'react'
import QRCode from 'qrcode'

interface Props {
  referralCode: string
  registerUrl: string
  customerName: string
}

export default function ReferralQRButton({ referralCode, registerUrl, customerName }: Props) {
  const [open, setOpen] = useState(false)
  const [qrSrc, setQrSrc] = useState<string>('')

  async function handleOpen() {
    if (!qrSrc) {
      const dataUrl = await QRCode.toDataURL(registerUrl, {
        width: 220,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0f172a', light: '#ffffff' },
      })
      setQrSrc(dataUrl)
    }
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        title="Ver QR de referido"
        className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
        </svg>
        QR
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-xs text-center"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-semibold text-gray-900 mb-1">QR de referido</p>
            <p className="text-xs text-gray-500 mb-4">{customerName}</p>
            {qrSrc && (
              <img src={qrSrc} alt="QR referido" className="mx-auto rounded-xl mb-4" width={220} height={220} />
            )}
            <p className="text-xs text-gray-400 mb-5 font-mono break-all">{referralCode}</p>
            <button
              onClick={() => setOpen(false)}
              className="w-full py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
