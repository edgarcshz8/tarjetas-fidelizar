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

  const subscription = await prisma.subscription.findUnique({
    where: { businessId: session.user.businessId },
    select: { status: true },
  })

  const showBanner =
    subscription === null ||
    subscription.status === 'PAST_DUE' ||
    subscription.status === 'CANCELLED'

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav session={session} />
      {showBanner && <SubscriptionBanner status={subscription?.status ?? null} />}
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
