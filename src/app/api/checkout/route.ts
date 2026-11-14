/**
 * PagoKit — Checkout endpoint para Mercado Pago
 *
 * Ruta: POST /api/checkout
 *
 * Crea una preferencia de pago en Mercado Pago y devuelve el init_point
 * para redirigir al usuario al checkout.
 *
 * Seguridad implementada:
 *   Rule 1:  API key desde process.env.MP_ACCESS_TOKEN — nunca hardcodeada.
 *   Rule 4:  Idempotency key con crypto.randomUUID().
 *   Rule 11: Mínimo PII — solo name, email del pagador (requeridos por MP).
 *   Rule 12: Nunca almacenar CVV, PAN ni track data.
 *
 * Notas técnicas:
 *   - CLP es moneda de cero decimales — amounts NO se multiplican por 100.
 *   - external_reference = businessId para correlacionar webhooks.
 */

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CheckoutError } from '@/lib/payments/errors'

// ─── Tipos ───────────────────────────────────────────────────────────────────

const ANNUAL_MONTHS = 10 // 2 meses gratis

interface CheckoutRequestBody {
  businessId: string
  planId: string
  payerEmail: string
  payerName: string
  billingPeriod?: 'monthly' | 'annual'
}

interface MpPreferenceResponse {
  id: string
  init_point: string
  sandbox_init_point: string
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleCheckout(request)
  } catch (err) {
    console.error('[checkout]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

async function handleCheckout(request: NextRequest): Promise<NextResponse> {
  let body: CheckoutRequestBody

  try {
    body = (await request.json()) as CheckoutRequestBody
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { businessId, planId, payerEmail, payerName, billingPeriod = 'monthly' } = body

  if (!businessId || !planId || !payerEmail || !payerName) {
    return NextResponse.json(
      { error: 'businessId, planId, payerEmail y payerName son requeridos' },
      { status: 400 },
    )
  }

  // Validar que el business existe
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true },
  })

  if (!business) {
    return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })
  }

  // Obtener el plan
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    select: { id: true, name: true, priceClp: true, isActive: true },
  })

  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: 'Plan no encontrado o inactivo' }, { status: 404 })
  }

  // Rule 1: API key desde variable de entorno — nunca hardcodeada
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) {
    console.error('[checkout] MP_ACCESS_TOKEN no configurado')
    return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Rule 4: idempotency key con crypto.randomUUID() — forma canónica
  const idempotencyKey = crypto.randomUUID()

  // CLP es moneda de cero decimales — NO multiplicar por 100
  const isAnnual = billingPeriod === 'annual'
  const unitPrice = isAnnual ? plan.priceClp * ANNUAL_MONTHS : plan.priceClp
  const periodLabel = isAnnual ? 'anual' : 'mensual'

  const preferencePayload = {
    items: [
      {
        id: plan.id,
        title: `Suscripción ${plan.name} (${periodLabel}) — Tarjetas de Fidelización`,
        description: `Plan mensual para ${business.name}`,
        quantity: 1,
        currency_id: 'CLP',
        unit_price: unitPrice, // CLP: sin decimales
      },
    ],
    payer: {
      // Rule 11: mínimo PII — solo los campos requeridos por MP
      name: payerName,
      email: payerEmail,
    },
    // external_reference = businessId para correlacionar en el webhook
    external_reference: businessId,
    back_urls: {
      success: `${appUrl}/checkout/success?business=${businessId}`,
      failure: `${appUrl}/checkout/failure?business=${businessId}`,
      pending: `${appUrl}/checkout/pending?business=${businessId}`,
    },
    auto_return: 'approved',
    statement_descriptor: 'TARJ FIDELIZAR',
    metadata: {
      plan_id: plan.id,
      business_id: businessId,
      // Rule 12: NUNCA incluir CVV, PAN ni track data
    },
  }

  let mpResponse: MpPreferenceResponse

  try {
    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`, // Rule 1
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey, // Rule 4
      },
      body: JSON.stringify(preferencePayload),
    })

    if (!res.ok) {
      const errBody = await res.text()
      throw new CheckoutError(`MP API error HTTP ${res.status}: ${errBody}`, res.status)
    }

    mpResponse = (await res.json()) as MpPreferenceResponse
  } catch (err) {
    if (err instanceof CheckoutError) {
      console.error(`[checkout] error MP — businessId=${businessId}`, {
        code: err.code,
        message: err.message,
        // Rule 6: nunca loguear datos del pagador
      })
      return NextResponse.json({ error: 'Error al crear preferencia de pago' }, { status: 502 })
    }
    throw err
  }

  // Crear registro de suscripción en estado PENDING
  await prisma.subscription.create({
    data: {
      businessId,
      planId,
      status: 'PENDING',
      mpSubscriptionId: mpResponse.id,
    },
  })

  const isProduction = process.env.NODE_ENV === 'production'

  return NextResponse.json({
    preferenceId: mpResponse.id,
    // En producción usar init_point, en test usar sandbox_init_point
    initPoint: isProduction ? mpResponse.init_point : mpResponse.sandbox_init_point,
  })
}
