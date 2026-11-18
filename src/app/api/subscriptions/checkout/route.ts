// SECURITY_RULES applied in this file:
//   Rule 3:  Idempotency key = crypto.randomUUID() — never Math.random() or Date.now()
//   Rule 6:  CLP is zero-decimal — transaction_amount passed as-is, never multiplied by 100
//   Rule 8:  Only log event id/type — never payer credentials or card data
//   Rule 11: Minimum PII — payer_email comes from the authenticated session, not from the request body
//   Rule 12: No CVV, PAN, or track-data stored or referenced

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import MercadoPagoConfig, { PreApproval } from 'mercadopago'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import {
  PlanNotFoundError,
  SubscriptionConflictError,
  MercadoPagoApiError,
  MercadoPagoPayerSiteError,
} from '@/lib/payments/errors'

const bodySchema = z.object({
  planId: z.string().min(1),
  businessId: z.string().min(1),
  // Rule 11: payer email provided by the authenticated user to identify their MP account —
  // used only in the MP API call, never persisted. Falls back to session email.
  mpPayerEmail: z.string().trim().toLowerCase().email().optional(),
})

function getMpClient(): MercadoPagoConfig {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new MercadoPagoApiError('MP_ACCESS_TOKEN is not set.')
  return new MercadoPagoConfig({ accessToken })
}

/** Extracts a readable error message from an MP SDK error without leaking the access token. */
function extractMpError(err: unknown): { status: number; message: string; cause?: unknown } {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    // MP SDK v2 wraps HTTP errors with { status, message, cause }
    const status = typeof e['status'] === 'number' ? e['status'] : 502
    const message = typeof e['message'] === 'string' ? e['message'] : 'Unknown MP error'
    const cause = e['cause'] ?? e['error'] ?? undefined
    return { status, message, cause }
  }
  return { status: 502, message: String(err) }
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

  const { planId, businessId, mpPayerEmail } = body
  const payerEmail = mpPayerEmail ?? session.user.email ?? ''

  if (session.user.businessId !== businessId) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  try {
    // Rule 3 (conflict check): return 409 if already ACTIVE
    const existing = await prisma.subscription.findUnique({ where: { businessId } })
    if (existing?.status === 'ACTIVE') {
      throw new SubscriptionConflictError(businessId)
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } })
    if (!plan || !plan.isActive) throw new PlanNotFoundError(planId)

    const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    const backUrl = `${appUrl}/admin/subscription`

    // Create a standalone preapproval (no preapproval_plan_id — that flow requires card_token_id).
    // MP returns init_point for the hosted checkout where the subscriber enters their card.
    // Rule 6: CLP is zero-decimal, transaction_amount is passed as-is.
    const client = getMpClient()
    const preApprovalClient = new PreApproval(client)
    const idempotencyKey = crypto.randomUUID() // Rule 3

    let mpSubscription: Awaited<ReturnType<typeof preApprovalClient.create>>
    try {
      mpSubscription = await preApprovalClient.create({
        body: {
          reason: `${plan.name} — MissStamps`,
          // Rule 11: email provided by the authenticated user for their MP account; not persisted
          payer_email: payerEmail,
          external_reference: businessId,
          back_url: backUrl,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: plan.price, // Rule 6: CLP zero-decimal
            currency_id: 'CLP',
          },
          status: 'pending',
        },
        requestOptions: { idempotencyKey }, // Rule 3
      })
    } catch (mpErr) {
      const { status, message, cause } = extractMpError(mpErr)
      // Rule 8: log status/message/cause — never the access token; mask email to avoid PII in logs
      const maskedEmail = payerEmail.replace(/^(.{2}).*(@.*)$/, '$1***$2')
      console.error(
        '[subscriptions:checkout] MP API error status=%d message=%s cause=%j email=%s',
        status, message, cause, maskedEmail,
      )
      if (status === 400 && message.toLowerCase().includes('different site')) {
        throw new MercadoPagoPayerSiteError()
      }
      throw new MercadoPagoApiError(`Mercado Pago respondió ${status}: ${message}`)
    }

    if (!mpSubscription.id || !mpSubscription.init_point) {
      throw new MercadoPagoApiError('MP no devolvió id ni init_point en la suscripción.')
    }

    // Upsert local Subscription record (TRIALING until webhook confirms authorized)
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
    if (err instanceof MercadoPagoPayerSiteError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus })
    }
    if (err instanceof MercadoPagoApiError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus })
    }
    console.error('[subscriptions:checkout] unexpected error:', err)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
