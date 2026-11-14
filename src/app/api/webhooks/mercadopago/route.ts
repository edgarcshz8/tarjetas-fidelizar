import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { prisma } from '@/lib/prisma'
import { WebhookSignatureError, WebhookTimestampError, WebhookReplayError } from '@/lib/payments/errors'

export const runtime = 'nodejs'

// ─── Firma ───────────────────────────────────────────────────────────────────
// MP envía: x-signature: ts=<epoch>,v1=<hmac-sha256-hex>
// Manifest: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
// Ref: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks

function verifySignature(req: NextRequest, dataId: string): void {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) {
    if (process.env.NODE_ENV !== 'production') return // omitir en dev si no hay secret
    throw new WebhookSignatureError('MP_WEBHOOK_SECRET no configurado')
  }

  const xSig = req.headers.get('x-signature') ?? ''
  const xReqId = req.headers.get('x-request-id') ?? ''

  if (!xSig || !xReqId) throw new WebhookSignatureError('cabeceras x-signature / x-request-id ausentes')

  // Parsear "ts=1234,v1=abc..."
  const parts: Record<string, string> = {}
  for (const seg of xSig.split(',')) {
    const eq = seg.indexOf('=')
    if (eq > 0) parts[seg.slice(0, eq).trim()] = seg.slice(eq + 1).trim()
  }

  const ts = parts['ts']
  const v1 = parts['v1']
  if (!ts || !v1) throw new WebhookSignatureError('formato x-signature inválido')

  // Validar que el webhook no tenga más de 5 minutos de antigüedad
  const ageSecs = Math.floor(Date.now() / 1000) - Number(ts)
  if (ageSecs > 300) throw new WebhookTimestampError(ageSecs)

  const manifest = `id:${dataId};request-id:${xReqId};ts:${ts};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))) {
    throw new WebhookSignatureError('HMAC no coincide')
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl

  // MP envía data.id como query param en el nuevo formato
  const dataId =
    url.searchParams.get('data.id') ??
    url.searchParams.get('id') ??
    null

  const eventType =
    url.searchParams.get('type') ??
    url.searchParams.get('topic') ??
    null

  if (!dataId || eventType !== 'payment') {
    // No es un evento de pago — ignorar silenciosamente
    return NextResponse.json({ ok: true })
  }

  try {
    verifySignature(req, dataId)
  } catch (err) {
    if (err instanceof WebhookSignatureError || err instanceof WebhookTimestampError) {
      console.error('[mp-webhook] verificación fallida:', (err as Error).message)
      return NextResponse.json({ error: (err as Error).message }, { status: (err as any).httpStatus ?? 401 })
    }
    throw err
  }

  // Obtener eventId para deduplicación (x-request-id o body.id)
  const eventId = req.headers.get('x-request-id') ?? `${eventType}:${dataId}:${Date.now()}`

  // Replay protection — Rule 9
  try {
    await prisma.webhookEvent.create({
      data: { eventId, eventType: eventType ?? 'payment' },
    })
  } catch {
    // Violación de constraint unique → ya procesado
    console.log(`[mp-webhook] replay detectado eventId=${eventId}`)
    return NextResponse.json({ ok: true })
  }

  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) {
    console.error('[mp-webhook] MP_ACCESS_TOKEN no configurado')
    return NextResponse.json({ ok: true }) // 200 para evitar reintentos de MP
  }

  // Consultar el pago en MP — NUNCA confiar en el body de la notificación
  const mpClient = new MercadoPagoConfig({ accessToken })
  const paymentClient = new Payment(mpClient)

  let payment: Awaited<ReturnType<typeof paymentClient.get>>
  try {
    payment = await paymentClient.get({ id: dataId })
  } catch (err: any) {
    console.error(`[mp-webhook] GET payment ${dataId} error:`, err?.message)
    return NextResponse.json({ ok: true })
  }

  console.log(`[mp-webhook] payment ${dataId} status=${payment.status} ref=${payment.external_reference ?? '-'}`)

  if (payment.status !== 'approved') {
    return NextResponse.json({ ok: true })
  }

  // Parsear external_reference: puede ser "businessId:planId" (nuevo) o "businessId" (legado preference)
  const ref = payment.external_reference ?? ''
  const colonIdx = ref.indexOf(':')
  const businessId = colonIdx > 0 ? ref.slice(0, colonIdx) : ref
  const planId     = colonIdx > 0 ? ref.slice(colonIdx + 1) : undefined

  if (!businessId) {
    console.error(`[mp-webhook] external_reference vacío para payment ${dataId}`)
    return NextResponse.json({ ok: true })
  }

  // Activar suscripción — idempotente
  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const updated = await prisma.subscription.updateMany({
    where: {
      businessId,
      ...(planId ? { planId } : {}),
      mpSubscriptionId: String(dataId),
    },
    data: {
      status:             'ACTIVE',
      mpStatusDetail:     payment.status_detail ?? null,
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
    },
  })

  if (updated.count === 0) {
    // Fallback: activar la suscripción PENDING más reciente del negocio
    const sub = await prisma.subscription.findFirst({
      where: { businessId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    })
    if (sub) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status:             'ACTIVE',
          mpSubscriptionId:   String(dataId),
          mpStatusDetail:     payment.status_detail ?? null,
          currentPeriodStart: now,
          currentPeriodEnd:   periodEnd,
        },
      })
    }
  }

  console.log(`[mp-webhook] suscripción activada businessId=${businessId} paymentId=${dataId}`)
  return NextResponse.json({ ok: true })
}
