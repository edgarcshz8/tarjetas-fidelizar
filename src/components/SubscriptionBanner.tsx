interface Props {
  daysLeft: number
  subscribeUrl: string
}

export default function SubscriptionBanner({ daysLeft, subscribeUrl }: Props) {
  const expired = daysLeft < 0

  const message = expired
    ? 'Tu suscripción ha vencido. Renueva para mantener el acceso.'
    : daysLeft === 0
    ? 'Tu suscripción vence hoy. Renueva para no perder el acceso.'
    : `Tu suscripción vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'}. Renueva para mantener el acceso.`

  const colors = expired
    ? 'bg-red-50 border-red-200 text-red-800'
    : 'bg-amber-50 border-amber-200 text-amber-800'

  const linkColors = expired
    ? 'text-red-900 hover:text-red-700'
    : 'text-amber-900 hover:text-amber-700'

  return (
    <div className={`border-b ${colors}`}>
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          {message}
        </div>
        <a
          href={subscribeUrl}
          className={`text-sm font-semibold transition whitespace-nowrap ${linkColors}`}
        >
          Renovar ahora →
        </a>
      </div>
    </div>
  )
}
