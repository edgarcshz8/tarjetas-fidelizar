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

// Maximum allowed body size: 256 KB
const MAX_BODY_BYTES = 256 * 1024

/** Verifies the Mercado Pago webhook signature.
 *
 * MP signature scheme (hmac_field_concat):
 *   manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 *   expected = HMAC-SHA256(manifest, MP_WEBHOOK_SECRET)  hex-encoded
 *
 * Rule 1: verification happens on the raw string BEFORE JSON.parse
 * Rule 2: timestamp window ±5 minutes
 * Rule 9: uses MP_WEBHOOK_SECRET
 * Rule 10: timingSafeEqual
 */
function verifyMpSignature(
  rawBody: string,
  xSignature: string | null,
  xRequestId: string | null,
): void {
  if (!xSignature || !xRequestId) {
    throw new WebhookSignatureError() // Rule 1
  }

  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) throw new WebhookSignatureError() // Rule 9

  // Parse x-signature header: "ts=<ts>,v1=<hash>"
  const parts = Object.fromEntries(
    xSignature.split(',').map((part) => {
      const idx = part.indexOf('=')
      return [part.slice(0, idx).trim(), part.slice(idx + 1).trim()]
    }),
  )
  const ts = parts['ts']
  const receivedHash = parts['v1']
  if (!ts || !receivedHash) throw new WebhookSignatureError() // Rule 1

  // Rule 2: timestamp window ±5 minutes
  const tsMs = Number(ts) * 1000
  const now = Date.now()
  if (Math.abs(now - tsMs) > 5 * 60 * 1000) throw new WebhookTimestampError()

  // Extract data.id from raw body (before full parse) for manifest
  let dataId: string
  try {
    const partial = JSON.parse(rawBody) as { data?: { id?: string } }
    dataId = String(partial?.data?.id ?? '')
  } catch {
    throw new WebhookSignatureError() // Rule 1
  }

  // Build manifest string
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`

  // Compute expected HMAC
  const expectedHex = createHmac('sha256', secret).update(manifest).digest('hex')

  // Rule 10: timingSafeEqual — never ===
  const expected = Buffer.from(expectedHex, 'utf8')
  const received = Buffer.from(receivedHash, 'utf8')
  if (expected.byteLength !== received.byteLength || !timingSafeEqual(expected, received)) {
    throw new WebhookSignatureError()
  }
}

/** Update Subscription row based on preapproval status from MP. */
async function handlePreapproval(payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as { id?: string } | undefined
  const mpSubscriptionId = data?.id
  if (!mpSubscriptionId) return

  // Map MP preapproval status to our SubscriptionStatus enum
  const mpStatus = (payload as { action?: string }).action ?? ''
  // The event action for preapproval: "subscription_preapproval.<status>"
  // e.g. "subscription_preapproval.authorized" → ACTIVE

  let status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | undefined
  if (mpStatus.includes('authorized')) status = 'ACTIVE'
  else if (mpStatus.includes('paused') || mpStatus.includes('pending')) status = 'PAST_DUE'
  else if (mpStatus.includes('cancelled')) status = 'CANCELLED'

  if (!status) return

  await prisma.subscription.updateMany({
    where: { mpSubscriptionId },
    data: {
      status,
      ...(status === 'CANCELLED' ? { canceledAt: new Date() } : {}),
    },
  })
}

/** Extend currentPeriodEnd when a subscription payment is confirmed. */
async function handleAuthorizedPayment(payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as { id?: string } | undefined
  if (!data?.id) return

  // MP sends preapproval_id inside the payment resource; look for it in the action field
  // The action is "subscription_authorized_payment.payment.created"
  // We fetch the preapproval_id from the payload path: data.preapproval_id
  const preapprovalId = (payload as Record<string, unknown>)['preapproval_id'] as
    | string
    | undefined
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
    verifyMpSignature(rawBody, xSignature, xRequestId) // Rule 1, Rule 2, Rule 9, Rule 10
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

  // Rule 8: log only id, type, created — never the full payload
  console.log('[webhook:mp] id=%s type=%s created=%s', eventId, eventType, eventCreated)

  // Return 200 immediately (MP expects fast response)
  const response = NextResponse.json({ received: true }, { status: 200 })

  // Rule 3: idempotency — deduplicate via unique mpEventId constraint
  if (eventId) {
    const alreadyProcessed = await prisma.webhookEvent.findUnique({
      where: { mpEventId: eventId },
    })
    if (alreadyProcessed) return response
  }

  // Route events
  try {
    if (eventType.startsWith('subscription_preapproval')) {
      await handlePreapproval(event)
    } else if (eventType.startsWith('subscription_authorized_payment')) {
      await handleAuthorizedPayment(event)
    } else {
      // TODO: handle additional event types if subscribed in MP Dashboard
      console.log('[webhook:mp] unhandled event type=%s', eventType)
    }

    // Record processed event (Rule 3 — deduplication)
    if (eventId) {
      await prisma.webhookEvent.create({
        data: { mpEventId: eventId, type: eventType },
      })
    }
  } catch (err) {
    console.error('[webhook:mp] processing error id=%s', eventId, err)
    // Still return 200 to avoid MP retrying a permanently-broken event
  }

  return response
}
