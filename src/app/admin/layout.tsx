import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AdminNav from '@/components/AdminNav'
import SubscriptionBanner from '@/components/SubscriptionBanner'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return <>{children}</>
  }

  // Calcular días restantes de la suscripción activa (solo para no-SUPERADMIN)
  let daysLeft: number | null = null
  if (session.user.role !== 'SUPERADMIN') {
    const sub = await prisma.subscription.findFirst({
      where: { businessId: session.user.businessId, status: 'ACTIVE' },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { currentPeriodEnd: true },
    })

    if (sub?.currentPeriodEnd) {
      const msLeft = sub.currentPeriodEnd.getTime() - Date.now()
      const dl = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
      if (dl <= 7) daysLeft = dl
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav session={session} />
      {daysLeft !== null && (
        <SubscriptionBanner
          daysLeft={daysLeft}
          subscribeUrl={`/${session.user.businessSlug}/subscribe`}
        />
      )}
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
