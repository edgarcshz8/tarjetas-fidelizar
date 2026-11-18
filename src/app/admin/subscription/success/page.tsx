// SECURITY_RULES applied in this file:
//   Rule 11: Minimum PII — this page receives no payment data; it is only a redirect landing
//   Note: The definitive subscription status is confirmed by the webhook, NOT by this redirect.

import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'

export const metadata = { title: 'Suscripción en proceso — Tarjetas Fidelizar' }

export default async function SubscriptionSuccessPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/admin/login')

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl bg-white border border-gray-200 shadow-sm p-10 text-center">
        <div className="mb-6 flex items-center justify-center">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-4xl">
            &#10003;
          </span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Tu suscripcion esta siendo procesada
        </h1>

        <p className="text-gray-500 text-sm mb-2">
          Mercado Pago esta confirmando tu pago. Este proceso puede tomar unos minutos.
        </p>
        <p className="text-gray-400 text-xs mb-8">
          El estado de tu suscripcion se actualizara automaticamente cuando recibamos la
          confirmacion. No es necesario que hagas nada mas.
        </p>

        <Link
          href="/admin/subscription"
          className="inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Ver estado de mi suscripcion
        </Link>
      </div>
    </main>
  )
}
