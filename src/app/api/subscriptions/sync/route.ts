// SECURITY_RULES applied in this file:
//   Rule 8:  Log only mpSubscriptionId and status — never full MP payload
//   Rule 9:  MP_ACCESS_TOKEN used as Bearer — not the webhook secret
//   Rule 11: Minimum PII — no card data or payer email involved

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'

interface MpPreapproval {
  id: string
  status: string
  external_reference?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const businessId = session.user.businessId

  const sub = await prisma.subscription.findUnique({
    where: { businessId },
    include: { plan: true },
  })

  if (!sub) {
    return NextResponse.json({ error: 'No se encontró suscripción.' }, { status: 404 })
  }

  if (!sub.mpSubscriptionId) {
    return NextResponse.json({ error: 'Suscripción sin ID de Mercado Pago.' }, { status: 422 })
  }

  const token = process.env.MP_ACCESS_TOKEN
  if (!token) {
    console.error('[subscriptions:sync] MP_ACCESS_TOKEN not set')
    return NextResponse.json({ error: 'Error de configuración del servidor.' }, { status: 500 })
  }

  let preapproval: MpPreapproval
  try {
    const res = await fetch(`https://api.mercadopago.com/preapproval/${sub.mpSubscriptionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('[subscriptions:sync] MP fetch failed status=%d body=%s', res.status, text)
      return NextResponse.json(
        { error: 'No se pudo consultar el estado en Mercado Pago.' },
        { status: 502 },
      )
    }
    preapproval = (await res.json()) as MpPreapproval
  } catch (err) {
    console.error('[subscriptions:sync] network error', err)
    return NextResponse.json({ error: 'Error de red al consultar Mercado Pago.' }, { status: 502 })
  }

  const mpStatus = preapproval.status
  console.log('[subscriptions:sync] mpSubscriptionId=%s mpStatus=%s', sub.mpSubscriptionId, mpStatus)

  let status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIALING' | undefined
  if (mpStatus === 'authorized') status = 'ACTIVE'
  else if (mpStatus === 'paused') status = 'PAST_DUE'
  else if (mpStatus === 'cancelled') status = 'CANCELLED'
  else if (mpStatus === 'pending') status = 'TRIALING'

  if (!status) {
    return NextResponse.json({ error: `Estado desconocido: ${mpStatus}` }, { status: 422 })
  }

  const periodStart = new Date()
  const periodEnd = new Date(periodStart)
  if (sub.plan.interval === 'MONTHLY') {
    periodEnd.setMonth(periodEnd.getMonth() + 1)
  } else {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status,
      ...(status === 'CANCELLED' ? { canceledAt: new Date() } : {}),
      ...(status === 'ACTIVE'
        ? { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd }
        : {}),
    },
  })

  return NextResponse.json({
    status,
    currentPeriodEnd: status === 'ACTIVE' ? periodEnd.toISOString() : null,
  })
}
