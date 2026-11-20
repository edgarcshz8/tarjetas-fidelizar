import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireActiveSubscription } from '@/lib/subscriptionGuard'
import QRScannerClient from '@/components/QRScannerClient'

export default async function ScannerPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/admin/login')
  await requireActiveSubscription(session.user.businessId)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Escanear Tarjeta</h1>
        <p className="text-gray-500">Escanea el QR de la tarjeta del cliente para agregar un sello</p>
      </div>
      <QRScannerClient />
    </div>
  )
}
