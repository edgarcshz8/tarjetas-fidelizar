import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const ANNUAL_MONTHS = 10

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
  deviceSessionId?: string
  payerName?: string
  payerEmail?: string
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 2)}***@${domain}`
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ProcessPaymentBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const {
    formData,
    businessId,
    planId,
    billingPeriod = 'monthly',
    deviceSessionId,
    payerName,
    payerEmail,
  } = body

  if (!businessId || !planId || !formData?.token) {
    return NextResponse.json(
      { error: 'Faltan campos requeridos (token, businessId, planId)' },
      { status: 400 },
    )
  }

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
  const periodDays  = isAnnual ? 365 : 30

  const nameParts = (payerName ?? '').trim().split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] ?? ''
  const lastName  = nameParts.slice(1).join(' ') || firstName

  // Priorizar el email que entrega el Brick; caer al billing form como fallback
  const payerEmailFinal = formData.payer?.email ?? payerEmail ?? ''

  const owner = await prisma.user.findFirst({
    where:  { businessId, role: 'OWNER' },
    select: { createdAt: true },
  })

  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

  // Referencia única por intento para correlación en MP Dashboard
  const attemptRef = `${businessId}:${planId}:${crypto.randomUUID()}`

  const paymentBody = {
    transaction_amount:  transactionAmount,
    token:               formData.token,
    payment_method_id:   formData.payment_method_id,
    issuer_id:           formData.issuer_id,
    installments:        formData.installments ?? 1,
    three_d_secure_mode: 'optional' as const,
    binary_mode:         true,
    payer: {
      email:          payerEmailFinal,
      first_name:     firstName || undefined,
      last_name:      lastName  || undefined,
      identification: formData.payer?.identification,
    },
    additional_info: {
      ip_address: ipAddress,
      items: [
        {
          id:          plan.id,
          title:       `Plan ${plan.name} - MissStamps`,
          description: `Suscripción ${periodLabel}`,
          category_id: 'services',
          quantity:    1,
          unit_price:  transactionAmount,
        },
      ],
      payer: {
        first_name:        firstName || undefined,
        last_name:         lastName  || undefined,
        registration_date: owner?.createdAt.toISOString(),
      },
    },
    external_reference:   attemptRef,
    notification_url:     `${appUrl}/api/webhook/mercadopago?source_news=webhooks`,
    description:          `Suscripción ${plan.name} (${periodLabel}) — MissStamps`,
    statement_descriptor: 'MISSTAMPS',
  }

  const hasDeviceSession = !!deviceSessionId
  console.log('[process-payment] iniciando pago', {
    businessId,
    planId,
    transactionAmount,
    paymentMethodId:   formData.payment_method_id,
    payerEmail:        payerEmailFinal ? maskEmail(payerEmailFinal) : '(vacío)',
    deviceSessionSent: hasDeviceSession,
    deviceSessionLen:  deviceSessionId?.length ?? 0,
    attemptRef,
  })

  let result: Awaited<ReturnType<typeof paymentClient.create>>
  try {
    result = await paymentClient.create({
      body: paymentBody,
      requestOptions: {
        idempotencyKey: crypto.randomUUID(),
        ...(deviceSessionId ? { meliSessionId: deviceSessionId } : {}),
      },
    })
  } catch (err: unknown) {
    const mpErr = err as { cause?: Array<{ description?: string }>; message?: string }
    const detail = mpErr?.cause?.[0]?.description ?? mpErr?.message ?? 'Error desconocido'
    console.error(`[process-payment] MP error businessId=${businessId}:`, detail)
    return NextResponse.json({ error: `Error al procesar el pago: ${detail}` }, { status: 502 })
  }

  console.log('[process-payment] resultado', {
    paymentId:    result.id,
    status:       result.status,
    statusDetail: result.status_detail ?? '-',
    businessId,
    deviceSessionSent: hasDeviceSession,
    payerEmail:   payerEmailFinal ? maskEmail(payerEmailFinal) : '(vacío)',
  })

  const now       = new Date()
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000)
  const isApproved = result.status === 'approved'

  const existing = await prisma.subscription.findFirst({
    where:   { businessId, planId, status: 'PENDING' },
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

  return NextResponse.json({
    id:                             result.id,
    status:                         result.status,
    status_detail:                  result.status_detail,
    three_ds_external_resource_url: result.three_ds_info?.external_resource_url,
  })
}
