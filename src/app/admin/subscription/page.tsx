// SECURITY_RULES applied in this file:
//   Rule 11: Minimum PII — the page only reads plan data and subscription status, no card data shown
//   Rule 12: No CVV, PAN, or track-data referenced

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import SubscriptionPlans from './_components/SubscriptionPlans'

export const metadata = { title: 'Suscripción — Tarjetas Fidelizar' }

/** Format an integer CLP amount as Chilean pesos: $29.990 */
function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount)
}

export default async function SubscriptionPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/admin/login')

  const [plans, currentSubscription] = await Promise.all([
    prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    }),
    prisma.subscription.findUnique({
      where: { businessId: session.user.businessId },
      include: { plan: true },
    }),
  ])

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Planes de suscripción</h1>
        <p className="text-gray-500 mb-8">
          Elige el plan que mejor se adapte a tu negocio. Los pagos se procesan mediante Mercado
          Pago.
        </p>

        {currentSubscription && (
          <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
              Suscripción actual
            </p>
            <p className="text-lg font-semibold text-gray-800">
              {currentSubscription.plan.name} —{' '}
              <span
                className={
                  currentSubscription.status === 'ACTIVE'
                    ? 'text-green-600'
                    : currentSubscription.status === 'CANCELLED'
                      ? 'text-red-500'
                      : 'text-yellow-600'
                }
              >
                {currentSubscription.status === 'ACTIVE'
                  ? 'Activa'
                  : currentSubscription.status === 'CANCELLED'
                    ? 'Cancelada'
                    : currentSubscription.status === 'PAST_DUE'
                      ? 'Pago pendiente'
                      : 'En período de prueba'}
              </span>
            </p>
            {currentSubscription.currentPeriodEnd && (
              <p className="text-sm text-gray-400 mt-1">
                Próximo cobro:{' '}
                {new Date(currentSubscription.currentPeriodEnd).toLocaleDateString('es-CL')}
              </p>
            )}
          </div>
        )}

        <SubscriptionPlans
          plans={plans.map((p: typeof plans[number]) => ({
            id: p.id,
            name: p.name,
            description: p.description ?? '',
            price: p.price,
            priceFormatted: formatCLP(p.price),
            interval: p.interval,
            features: p.features as string[],
          }))}
          businessId={session.user.businessId}
          activeSubscriptionStatus={currentSubscription?.status ?? null}
        />
      </div>
    </main>
  )
}
