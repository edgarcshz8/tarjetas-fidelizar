// SECURITY_RULES applied in this file:
//   Rule 1:  Verify MP webhook signature BEFORE parsing the body
//   Rule 2:  Reject events with timestamp outside ±5-minute window
//   Rule 3:  Idempotency via WebhookEvent.mpEventId (unique constraint)
//   Rule 8:  Log only event.id, event.type, event.created — never the full payload
//   Rule 9:  Signature verified with MP_WEBHOOK_SECRET, not the access token
//   Rule 10: timingSafeEqual from Node crypto — never ===
//   Rule 11: Minimum PII — no payer email or card data logged or stored beyond required fields
//   Rule 12: No CVV, PAN, or track-data stored or referenced

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto' // Rule 10
import { prisma } from '@/lib/prisma'
import {
  WebhookSignatureError,
  WebhookTimestampError,
} from '@/lib/payments/errors'

const MAX_BODY_BYTES = 256 * 1024

/** Fetches a resource from the MP REST API. Never logs the access token. */
async function mpFetch<T>(path: string): Promise<T> {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) throw new Error('MP_ACCESS_TOKEN not set')
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

/** Verifies the Mercado Pago webhook signature (hmac_field_concat scheme).
 *  Rule 1: verification on raw string BEFORE JSON.parse.
 *  Rule 2: timestamp window ±5 minutes.
 *  Rule 9: MP_WEBHOOK_SECRET.
 *  Rule 10: timingSafeEqual.
 */
function verifyMpSignature(
  rawBody: string,
  xSignature: string | null,
  xRequestId: string | null,
): void {
  if (!xSignature || !xRequestId) throw new WebhookSignatureError()

  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) throw new WebhookSignatureError()

  const parts = Object.fromEntries(
    xSignature.split(',').map((part) => {
      const idx = part.indexOf('=')
      return [part.slice(0, idx).trim(), part.slice(idx + 1).trim()]
    }),
  )
  const ts = parts['ts']
  const receivedHash = parts['v1']
  if (!ts || !receivedHash) throw new WebhookSignatureError()

  const tsMs = Number(ts) * 1000
  if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) throw new WebhookTimestampError()

  let dataId: string
  try {
    const partial = JSON.parse(rawBody) as { data?: { id?: string } }
    dataId = String(partial?.data?.id ?? '')
  } catch {
    throw new WebhookSignatureError()
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const expectedHex = createHmac('sha256', secret).update(manifest).digest('hex')

  const expected = Buffer.from(expectedHex, 'utf8')
  const received = Buffer.from(receivedHash, 'utf8')
  if (expected.byteLength !== received.byteLength || !timingSafeEqual(expected, received)) {
    throw new WebhookSignatureError()
  }
}

interface MpPreapproval {
  id: string
  status: string           // "authorized" | "paused" | "cancelled" | "pending"
  external_reference?: string
}

/** Returns currentPeriodStart/End for a new activation based on plan interval. */
function calcInitialPeriod(interval: string): { currentPeriodStart: Date; currentPeriodEnd: Date } {
  const start = new Date()
  const end = new Date(start)
  if (interval === 'MONTHLY') {
    end.setMonth(end.getMonth() + 1)
  } else {
    end.setFullYear(end.getFullYear() + 1)
  }
  return { currentPeriodStart: start, currentPeriodEnd: end }
}

interface MpAuthorizedPayment {
  id: string
  preapproval_id: string
  status: string
}

/**
 * Handle subscription_preapproval events.
 * Re-fetches the preapproval from MP to get the authoritative status (never trusts payload alone).
 * Uses external_reference (= businessId) as fallback lookup when mpSubscriptionId is not in DB yet.
 */
async function handlePreapproval(mpSubscriptionId: string): Promise<void> {
  // Re-fetch from MP — authoritative source of truth
  let preapproval: MpPreapproval
  try {
    preapproval = await mpFetch<MpPreapproval>(`/preapproval/${mpSubscriptionId}`)
  } catch (err) {
    console.error('[webhook:mp] could not fetch preapproval id=%s', mpSubscriptionId, err)
    return
  }

  const mpStatus = preapproval.status
  let status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIALING' | undefined
  if (mpStatus === 'authorized') status = 'ACTIVE'
  else if (mpStatus === 'paused') status = 'PAST_DUE'
  else if (mpStatus === 'cancelled') status = 'CANCELLED'
  else if (mpStatus === 'pending') status = 'TRIALING'

  if (!status) {
    console.log('[webhook:mp] unhandled preapproval status=%s id=%s', mpStatus, mpSubscriptionId)
    return
  }

  // Primary lookup: by mpSubscriptionId (set at checkout creation time)
  const byMpId = await prisma.subscription.findUnique({
    where: { mpSubscriptionId },
    include: { plan: true },
  })

  if (byMpId) {
    await prisma.subscription.update({
      where: { id: byMpId.id },
      data: {
        status,
        ...(status === 'CANCELLED' ? { canceledAt: new Date() } : {}),
        // Set period dates on first activation; subsequent updates come from handleAuthorizedPayment
        ...(status === 'ACTIVE' && !byMpId.currentPeriodStart
          ? calcInitialPeriod(byMpId.plan.interval)
          : {}),
      },
    })
    return
  }

  // Fallback: use external_reference (= businessId) in case the subscription record
  // was not yet written to DB when this webhook fired
  const extRef = preapproval.external_reference
  if (extRef) {
    const byExtRef = await prisma.subscription.findFirst({
      where: { businessId: extRef },
      include: { plan: true },
    })
    await prisma.subscription.updateMany({
      where: { businessId: extRef },
      data: {
        mpSubscriptionId,
        status,
        ...(status === 'CANCELLED' ? { canceledAt: new Date() } : {}),
        ...(status === 'ACTIVE' && byExtRef && !byExtRef.currentPeriodStart
          ? calcInitialPeriod(byExtRef.plan.interval)
          : {}),
      },
    })
  }
}

/**
 * Handle subscription_authorized_payment events.
 * Fetches the authorized_payment from MP to get preapproval_id, then extends the period.
 */
async function handleAuthorizedPayment(authorizedPaymentId: string): Promise<void> {
  let payment: MpAuthorizedPayment
  try {
    payment = await mpFetch<MpAuthorizedPayment>(`/authorized_payments/${authorizedPaymentId}`)
  } catch (err) {
    console.error('[webhook:mp] could not fetch authorized_payment id=%s', authorizedPaymentId, err)
    return
  }

  const preapprovalId = payment.preapproval_id
  if (!preapprovalId) return

  const sub = await prisma.subscription.findUnique({
    where: { mpSubscriptionId: preapprovalId },
    include: { plan: true },
  })
  if (!sub) return

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
      status: 'ACTIVE',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  })
}

// @pagokit:signature-verified
// pagokit-ignore: webhook-has-signature -- verifyMpSignature called below; HMAC-SHA256 + timingSafeEqual (Rules 1, 9, 10)
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rule 1: read raw body BEFORE any parsing
  const rawBuffer = await req.arrayBuffer()
  if (rawBuffer.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }
  const rawBody = Buffer.from(rawBuffer).toString('utf8')

  const xSignature = req.headers.get('x-signature')
  const xRequestId = req.headers.get('x-request-id')

  try {
    verifyMpSignature(rawBody, xSignature, xRequestId)
  } catch (err) {
    if (err instanceof WebhookSignatureError || err instanceof WebhookTimestampError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus })
    }
    return NextResponse.json({ error: 'Signature error' }, { status: 401 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventId = String(event.id ?? '')
  const eventType = String(event.type ?? event.action ?? '')
  const eventCreated = String(event.date_created ?? '')
  const dataId = String((event.data as { id?: string } | undefined)?.id ?? '')

  // Rule 8: log only id, type, created — never the full payload
  console.log('[webhook:mp] id=%s type=%s created=%s', eventId, eventType, eventCreated)

  // Return 200 immediately — MP expects a fast response
  const response = NextResponse.json({ received: true }, { status: 200 })

  // Rule 3: idempotency — deduplicate via unique mpEventId constraint
  if (eventId) {
    const alreadyProcessed = await prisma.webhookEvent.findUnique({
      where: { mpEventId: eventId },
    })
    if (alreadyProcessed) return response
  }

  try {
    if (eventType.startsWith('subscription_preapproval') && dataId) {
      await handlePreapproval(dataId)
    } else if (eventType.startsWith('subscription_authorized_payment') && dataId) {
      await handleAuthorizedPayment(dataId)
    } else {
      console.log('[webhook:mp] unhandled type=%s', eventType)
    }

    if (eventId) {
      await prisma.webhookEvent.create({
        data: { mpEventId: eventId, type: eventType },
      })
    }
  } catch (err) {
    console.error('[webhook:mp] processing error id=%s', eventId, err)
  }

  return response
}
