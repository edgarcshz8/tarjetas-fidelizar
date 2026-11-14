import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const ANNUAL_MONTHS = 10 // 2 meses gratis

interface ProcessPaymentBody {
  formData: {
    token: string
    payment_method_id: string
    issuer_id?: number
    installments?: number
    payer?: {
      email?: string
      identification?: { type?: string; number?: string }
    }
  }
  businessId: string
  planId: string
  billingPeriod?: 'monthly' | 'annual'
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ProcessPaymentBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { formData, businessId, planId, billingPeriod = 'monthly' } = body

  if (!businessId || !planId || !formData?.token) {
    return NextResponse.json({ error: 'Faltan campos requeridos (token, businessId, planId)' }, { status: 400 })
  }

  // Obtener precio del plan desde la BD — NUNCA confiar en el monto del cliente
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    select: { id: true, name: true, priceClp: true, isActive: true },
  })

  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: 'Plan no encontrado o inactivo' }, { status: 404 })
  }

  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) {
    console.error('[process-payment] MP_ACCESS_TOKEN no configurado')
    return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 })
  }

  const rawAppUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const appUrl = /^https?:\/\//.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`

  const client = new MercadoPagoConfig({ accessToken })
  const paymentClient = new Payment(client)

  const isAnnual = billingPeriod === 'annual'
  const transactionAmount = isAnnual ? plan.priceClp * ANNUAL_MONTHS : plan.priceClp
  const periodLabel = isAnnual ? 'anual' : 'mensual'
  const periodDays = isAnnual ? 365 : 30

  let result: Awaited<ReturnType<typeof paymentClient.create>>
  try {
    result = await paymentClient.create({
      body: {
        transaction_amount: transactionAmount, // CLP: sin decimales
        token:              formData.token,
        payment_method_id:  formData.payment_method_id,
        issuer_id:          formData.issuer_id,
        installments:       formData.installments ?? 1,
        payer: {
          email:          formData.payer?.email,
          identification: formData.payer?.identification as any,
        },
        external_reference:  `${businessId}:${planId}`,
        notification_url:    `${appUrl}/api/webhooks/mercadopago`,
        description:         `Suscripción ${plan.name} (${periodLabel}) — Tarjetas de Fidelización`,
        statement_descriptor: 'TARJ FIDELIZAR',
      },
      requestOptions: { idempotencyKey: crypto.randomUUID() },
    })
  } catch (err: any) {
    // MP SDK v2 wraps los errores en err.cause[0].description
    const detail = err?.cause?.[0]?.description ?? err?.message ?? 'Error desconocido'
    console.error(`[process-payment] MP error businessId=${businessId}:`, detail)
    return NextResponse.json({ error: `Error al procesar el pago: ${detail}` }, { status: 502 })
  }

  // Actualizar suscripción en BD
  const now = new Date()
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000)
  const isApproved = result.status === 'approved'

  const existing = await prisma.subscription.findFirst({
    where: { businessId, planId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  })

  const subData = {
    mpSubscriptionId: String(result.id),
    mpStatusDetail:   result.status_detail ?? null,
    status:           isApproved ? ('ACTIVE' as const) : ('PENDING' as const),
    ...(isApproved && { currentPeriodStart: now, currentPeriodEnd: periodEnd }),
  }

  if (existing) {
    await prisma.subscription.update({ where: { id: existing.id }, data: subData })
  } else {
    await prisma.subscription.create({ data: { businessId, planId, ...subData } })
  }

  console.log(`[process-payment] businessId=${businessId} plan=${plan.name} status=${result.status} detail=${result.status_detail ?? '-'}`)

  return NextResponse.json({
    id:            result.id,
    status:        result.status,
    status_detail: result.status_detail,
  })
}
