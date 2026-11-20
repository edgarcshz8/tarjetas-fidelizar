'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type SubscriptionStatus = 'PENDING' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | null

interface Props {
  status: SubscriptionStatus
}

const MESSAGES: Partial<Record<NonNullable<SubscriptionStatus> | 'NO_SUBSCRIPTION', { text: string; cta: string; color: string }>> = {
  PAST_DUE: {
    text: 'Tu suscripción no pudo renovarse. Actualiza tu método de pago para seguir usando la plataforma.',
    cta: 'Renovar ahora →',
    color: 'bg-red-50 border-red-200 text-red-800',
  },
  CANCELLED: {
    text: 'Tu suscripción está cancelada. Reactívala para seguir accediendo a todas las funciones.',
    cta: 'Reactivar suscripción →',
    color: 'bg-orange-50 border-orange-200 text-orange-800',
  },
  NO_SUBSCRIPTION: {
    text: 'No tienes una suscripción activa. Elige un plan para comenzar a usar la plataforma.',
    cta: 'Ver planes →',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
  },
}

export default function SubscriptionBanner({ status }: Props) {
  const pathname = usePathname()

  // Don't show on the subscription page itself
  if (pathname?.startsWith('/admin/subscription')) return null

  const key = status === null ? 'NO_SUBSCRIPTION' : (status as keyof typeof MESSAGES)
  const config = MESSAGES[key]
  if (!config) return null

  return (
    <div className={`border-b ${config.color}`}>
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm">{config.text}</p>
        <Link
          href="/admin/subscription"
          className="text-sm font-semibold whitespace-nowrap underline underline-offset-2 hover:no-underline"
        >
          {config.cta}
        </Link>
      </div>
    </div>
  )
}
