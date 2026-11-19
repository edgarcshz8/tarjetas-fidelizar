// SECURITY_RULES applied in this file:
//   Rule 3:  Idempotency key = crypto.randomUUID() — never Math.random() or Date.now()
//   Rule 6:  CLP is zero-decimal — transaction_amount passed as-is, never multiplied by 100
//   Rule 8:  Log only status/message/cause and masked email — never card token or raw card data
//   Rule 11: Minimum PII — cardTokenId used once in the MP call, never persisted or logged
//   Rule 12: No CVV, PAN, or track-data stored or referenced — MP Brick tokenizes client-side

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { PreApproval } from 'mercadopago'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import {
  PlanNotFoundError,
  SubscriptionConflictError,
  MercadoPagoApiError,
  MercadoPagoPayerSiteError,
} from '@/lib/payments/errors'
import { getMpClient, extractMpError, maskEmail, mapMpCardRejection } from '@/lib/payments/mp'

const bodySchema = z.object({
  planId: z.string().min(1),
  businessId: z.string().min(1),
  // Rule 12: MP-issued card token (not raw card data); used once and never persisted
  cardTokenId: z.string().min(1),
  // Rule 11: contact email only — not an MP account credential; used in MP call, not stored
  payerEmail: z.string().trim().toLowerCase().email(),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 })
  }

  const { planId, businessId, cardTokenId, payerEmail } = body

  if (session.user.businessId !== businessId) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  try {
    const existing = await prisma.subscription.findUnique({ where: { businessId } })
    if (existing?.status === 'ACTIVE') {
      throw new SubscriptionConflictError(businessId)
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } })
    if (!plan || !plan.isActive) throw new PlanNotFoundError(planId)

    const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    const backUrl = `${appUrl}/admin/subscription`

    const client = getMpClient()
    const preApprovalClient = new PreApproval(client)
    const idempotencyKey = crypto.randomUUID() // Rule 3

    let mpSubscription: Awaited<ReturnType<typeof preApprovalClient.create>>
    try {
      mpSubscription = await preApprovalClient.create({
        body: {
          reason: `${plan.name} — MissStamps`,
          payer_email: payerEmail,           // Rule 11: contact only, not persisted
          external_reference: businessId,
          card_token_id: cardTokenId,        // Rule 12: token used once; never stored
          back_url: backUrl,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: plan.price,  // Rule 6: CLP zero-decimal
            currency_id: 'CLP',
          },
          status: 'authorized',
        },
        requestOptions: { idempotencyKey }, // Rule 3
      })
    } catch (mpErr) {
      const { status, message, cause } = extractMpError(mpErr)
      // Rule 8: never log cardTokenId; mask email
      console.error(
        '[subscriptions:authorize] MP API error status=%d message=%s cause=%j email=%s',
        status, message, cause, maskEmail(payerEmail),
      )
      if (status === 400 && message.toLowerCase().includes('different site')) {
        throw new MercadoPagoPayerSiteError()
      }
      if (status === 400 || status === 422) {
        throw new MercadoPagoApiError(mapMpCardRejection(cause, message))
      }
      throw new MercadoPagoApiError(`Mercado Pago respondió ${status}: ${message}`)
    }

    if (!mpSubscription.id) {
      throw new MercadoPagoApiError('MP no devolvió un ID de suscripción.')
    }

    // Webhook is the authoritative source of truth; this is an optimistic initial status.
    const subscriptionStatus = mpSubscription.status === 'authorized' ? 'ACTIVE' : 'TRIALING'

    // Set period dates immediately on ACTIVE so the UI shows them without waiting for the webhook
    const periodStart = new Date()
    const periodEnd = new Date(periodStart)
    if (plan.interval === 'MONTHLY') {
      periodEnd.setMonth(periodEnd.getMonth() + 1)
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    }
    const periodData = subscriptionStatus === 'ACTIVE'
      ? { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd }
      : {}

    await prisma.subscription.upsert({
      where: { businessId },
      create: {
        businessId,
        planId,
        status: subscriptionStatus,
        mpSubscriptionId: mpSubscription.id,
        ...periodData,
      },
      update: {
        planId,
        status: subscriptionStatus,
        mpSubscriptionId: mpSubscription.id,
        canceledAt: null,
        ...periodData,
      },
    })

    return NextResponse.json({ status: subscriptionStatus }, { status: 200 })
  } catch (err) {
    if (err instanceof SubscriptionConflictError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus })
    }
    if (err instanceof PlanNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus })
    }
    if (err instanceof MercadoPagoPayerSiteError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus })
    }
    if (err instanceof MercadoPagoApiError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus })
    }
    console.error('[subscriptions:authorize] unexpected error:', err)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
