import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { generateQRDataURL } from '@/lib/qr'
import Image from 'next/image'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ReferralQRPage({ params }: { params: { code: string } }) {
  const pass = await prisma.customerPass.findUnique({
    where: { referralCode: params.code },
    include: {
      customer: true,
      program: { include: { business: true } },
    },
  })

  if (!pass) notFound()

  const rawAppUrl = process.env.APP_URL || 'http://localhost:3000'
  const appUrl = /^https?:\/\//.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`
  const registerUrl = `${appUrl}/${pass.program.business.slug}?ref=${params.code}`

  const qrDataUrl = await generateQRDataURL(registerUrl)

  const firstName = pass.customer.name.trim().split(/\s+/)[0]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">

        {/* Header */}
        <div>
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            {firstName} te invita
          </h1>
          <p className="text-slate-400 text-sm">
            Únete al programa de fidelización de{' '}
            <span className="text-white font-medium">{pass.program.business.name}</span>
          </p>
        </div>

        {/* QR Card */}
        <div className="bg-white rounded-3xl p-6 shadow-2xl">
          <p className="text-sm font-medium text-gray-600 mb-4">
            Escanea el código QR para registrarte
          </p>
          <div className="flex justify-center mb-4">
            <Image
              src={qrDataUrl}
              alt="Código QR de referido"
              width={200}
              height={200}
              className="rounded-xl"
              unoptimized
            />
          </div>
          <p className="text-xs text-gray-400">
            Apunta la cámara de tu teléfono al código
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/20" />
          <span className="text-white/40 text-xs">o</span>
          <div className="flex-1 h-px bg-white/20" />
        </div>

        {/* Direct link button */}
        <Link
          href={registerUrl}
          className="block w-full py-3.5 bg-white text-slate-900 font-semibold text-sm rounded-2xl hover:bg-gray-100 transition shadow-lg"
        >
          Registrarme directamente →
        </Link>

        {/* Program info */}
        <p className="text-slate-500 text-xs px-4">
          Acumula {pass.program.stampsRequired} sellos y gana: {pass.program.rewardDescription}
        </p>

      </div>
    </div>
  )
}
