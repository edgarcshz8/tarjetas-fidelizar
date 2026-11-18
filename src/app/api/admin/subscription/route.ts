// SECURITY_RULES applied in this file:
//   Rule 8:  Minimum logging — no payer details in logs
//   Rule 11: Minimum PII — only return subscription status fields to the client, never payer card data
//   Rule 12: No CVV, PAN, or track-data stored or referenced

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import MercadoPagoConfig, { PreApproval } from 'mercadopago'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { MercadoPagoApiError } from '@/lib/payments/errors'

function getMpClient(): MercadoPagoConfig {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new MercadoPagoApiError('MP_ACCESS_TOKEN is not set.')
  return new MercadoPagoConfig({ accessToken })
}

/** GET /api/admin/subscription — returns the current subscription for the authenticated business */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const subscription = await prisma.subscription.findUnique({
    where: { businessId: session.user.businessId },
    include: { plan: true },
  })

  if (!subscription) {
    return NextResponse.json({ subscription: null }, { status: 200 })
  }

  // Rule 11: return only the fields the UI needs — no mpPayerId, no payer email
  return NextResponse.json(
    {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        planName: subscription.plan.name,
        planPrice: subscription.plan.price,
        planInterval: subscription.plan.interval,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        canceledAt: subscription.canceledAt,
        createdAt: subscription.createdAt,
      },
    },
    { status: 200 },
  )
}

/** DELETE /api/admin/subscription — cancels the active subscription */
export async function DELETE(_req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const subscription = await prisma.subscription.findUnique({
    where: { businessId: session.user.businessId },
  })

  if (!subscription) {
    return NextResponse.json({ error: 'No existe una suscripción activa.' }, { status: 404 })
  }

  if (subscription.status === 'CANCELLED') {
    return NextResponse.json({ error: 'La suscripción ya está cancelada.' }, { status: 409 })
  }

  try {
    // Cancel in Mercado Pago if we have a remote id
    if (subscription.mpSubscriptionId) {
      const client = getMpClient()
      const preApprovalClient = new PreApproval(client)
      await preApprovalClient.update({
        id: subscription.mpSubscriptionId,
        body: { status: 'cancelled' },
      })
    }

    // Update local DB
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELLED',
        canceledAt: new Date(),
      },
    })

    return NextResponse.json({ cancelled: true }, { status: 200 })
  } catch (err) {
    if (err instanceof MercadoPagoApiError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus })
    }
    console.error('[admin:subscription:delete] unexpected error:', err)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
