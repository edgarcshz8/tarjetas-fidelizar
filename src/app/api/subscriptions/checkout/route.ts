// SECURITY_RULES applied in this file:
//   Rule 3:  Idempotency key = crypto.randomUUID() — never Math.random() or Date.now()
//   Rule 6:  CLP is zero-decimal — transaction_amount passed as-is, never multiplied by 100
//   Rule 8:  Only log event id/type — never payer credentials or card data
//   Rule 11: Minimum PII — payer_email comes from the authenticated session, not from the request body
//   Rule 12: No CVV, PAN, or track-data stored or referenced

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import MercadoPagoConfig, { PreApprovalPlan, PreApproval } from 'mercadopago'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import {
  PlanNotFoundError,
  SubscriptionConflictError,
  MercadoPagoApiError,
} from '@/lib/payments/errors'

const bodySchema = z.object({
  planId: z.string().min(1),
  businessId: z.string().min(1),
})

function getMpClient(): MercadoPagoConfig {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new MercadoPagoApiError('MP_ACCESS_TOKEN is not set.')
  return new MercadoPagoConfig({ accessToken })
}

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

  const { planId, businessId } = body

  // Only the owner of the business can initiate a checkout
  if (session.user.businessId !== businessId) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  try {
    // Rule 3 (conflict check): return 409 if already ACTIVE
    const existing = await prisma.subscription.findUnique({
      where: { businessId },
    })
    if (existing && existing.status === 'ACTIVE') {
      throw new SubscriptionConflictError(businessId)
    }

    // Load the plan
    const plan = await prisma.plan.findUnique({ where: { id: planId } })
    if (!plan || !plan.isActive) throw new PlanNotFoundError(planId)

    const client = getMpClient()
    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const backUrl = `${appUrl}/admin/subscription/success`

    // Ensure the preapproval_plan exists in MP — create it if mpPlanId is not set
    let mpPlanId = plan.mpPlanId
    if (!mpPlanId) {
      const planClient = new PreApprovalPlan(client)
      // Rule 3: idempotency key for the plan-creation call
      const planIdempotencyKey = crypto.randomUUID() // Rule 3
      const mpPlan = await planClient.create({
        body: {
          reason: `${plan.name} - Tarjetas Fidelizar`,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: plan.price, // Rule 6: CLP zero-decimal, no *100
            currency_id: 'CLP',
          },
          back_url: backUrl,
          status: 'active',
        },
        requestOptions: { idempotencyKey: planIdempotencyKey }, // Rule 3
      })

      if (!mpPlan.id) throw new MercadoPagoApiError('No se pudo crear el plan en Mercado Pago.')

      mpPlanId = mpPlan.id
      await prisma.plan.update({ where: { id: planId }, data: { mpPlanId } })
    }

    // Create the preapproval subscription in MP
    const preApprovalClient = new PreApproval(client)
    const checkoutIdempotencyKey = crypto.randomUUID() // Rule 3

    // Rule 11: payer_email comes from the authenticated session — minimum PII
    const mpSubscription = await preApprovalClient.create({
      body: {
        preapproval_plan_id: mpPlanId,
        payer_email: session.user.email,
        back_url: backUrl,
        status: 'pending',
      },
      requestOptions: { idempotencyKey: checkoutIdempotencyKey }, // Rule 3
    })

    if (!mpSubscription.id || !mpSubscription.init_point) {
      throw new MercadoPagoApiError('No se pudo crear la suscripción en Mercado Pago.')
    }

    // Upsert local Subscription record (TRIALING until webhook confirms ACTIVE)
    await prisma.subscription.upsert({
      where: { businessId },
      create: {
        businessId,
        planId,
        status: 'TRIALING',
        mpSubscriptionId: mpSubscription.id,
      },
      update: {
        planId,
        status: 'TRIALING',
        mpSubscriptionId: mpSubscription.id,
        canceledAt: null,
      },
    })

    return NextResponse.json({ init_point: mpSubscription.init_point }, { status: 200 })
  } catch (err) {
    if (err instanceof SubscriptionConflictError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus })
    }
    if (err instanceof PlanNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus })
    }
    if (err instanceof MercadoPagoApiError) {
      console.error('[subscriptions:checkout] MP API error:', err.message)
      return NextResponse.json({ error: err.message }, { status: err.httpStatus })
    }
    console.error('[subscriptions:checkout] unexpected error:', err)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
