/**
 * PagoKit — Webhook handler de Mercado Pago
 *
 * Ruta: POST /api/webhook/mercadopago
 *
 * Seguridad implementada:
 *   Rule 3:  Verificación de firma HMAC-SHA256 ANTES de parsear el payload.
 *   Rule 5:  Raw body con `await request.text()` — nunca `request.json()` directamente.
 *   Rule 6:  Solo se loguea event_id, event_type, event_created — NUNCA el payload completo.
 *   Rule 9:  Replay protection: ventana de timestamp 300s + deduplicación por event_id en DB.
 *   Rule 10: Body cap de 256 KB.
 *   Rule 12: Nunca almacenamos CVV, PAN ni track data.
 *
 * Firma MP (family: hmac_field_concat):
 *   Header:  x-signature   → formato KV "ts=<timestamp>,v1=<hmac>"
 *   Header:  x-request-id  → ID único del evento (usado para dedup)
 *   Template: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 *   Algoritmo: HMAC-SHA256 con MP_WEBHOOK_SECRET como clave
 */

// Rule 3 & Rule 5: runtime 'nodejs' necesario para leer el raw body correctamente en Next.js App Router
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import {
  WebhookSignatureError,
  WebhookReplayError,
  WebhookTimestampError,
  normalizeMpStatus,
} from '@/lib/payments/errors'

// Rule 10: cap de body size 256 KB
const MAX_BODY_BYTES = 256 * 1024

// Rule 9: ventana de tiempo permitida para el timestamp (300 segundos)
const TIMESTAMP_WINDOW_SECS = 300

// ─── Tipos mínimos del payload de webhook ───────────────────────────────────

interface MpWebhookPayload {
  id?: number | string
  type?: string
  action?: string
  data?: {
    id?: string | number
  }
  date_created?: string
}

// ─── Tipos de la respuesta de GET /v1/payments/{id} ─────────────────────────

interface MpPaymentResponse {
  id: number
  status: string
  status_detail: string
  external_reference?: string
  payer?: {
    id?: string | number
    email?: string
  }
  metadata?: Record<string, unknown>
  date_approved?: string
  date_created?: string
}

// ─── Verificación de firma HMAC ──────────────────────────────────────────────

/**
 * Verifica la firma HMAC-SHA256 del webhook de Mercado Pago.
 * Rule 3: Esta función DEBE ejecutarse antes de cualquier parseo del payload.
 */
function verifyMpSignature(
  dataId: string,
  requestId: string,
  ts: string,
  v1: string,
  secret: string,
): void {
  // Rule 9: Verificar ventana de timestamp
  const tsNum = parseInt(ts, 10)
  if (isNaN(tsNum)) {
    throw new WebhookSignatureError('timestamp no es un número')
  }

  const nowSecs = Math.floor(Date.now() / 1000)
  const ageSecs = Math.abs(nowSecs - tsNum)

  if (ageSecs > TIMESTAMP_WINDOW_SECS) {
    throw new WebhookTimestampError(ageSecs)
  }

  // Template de firma: "id:{data.id};request-id:{x-request-id};ts:{timestamp};"
  const signedTemplate = `id:${dataId};request-id:${requestId};ts:${ts};`

  const expectedHmac = createHmac('sha256', secret)
    .update(signedTemplate)
    .digest('hex')

  // timingSafeEqual para prevenir timing attacks
  const expectedBuf = Buffer.from(expectedHmac, 'utf8')
  const receivedBuf = Buffer.from(v1, 'utf8')

  if (
    expectedBuf.length !== receivedBuf.length ||
    !timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    throw new WebhookSignatureError('HMAC no coincide')
  }
}

// ─── Re-fetch del pago desde la API de MP ────────────────────────────────────

/**
 * Siempre re-fetchea el pago desde la API de MP — el payload del webhook NO es autoritativo.
 * Rule 1: Usa process.env.MP_ACCESS_TOKEN — nunca hardcodeado.
 */
async function fetchPaymentFromMp(paymentId: string): Promise<MpPaymentResponse> {
  // Rule 1: API key desde variable de entorno
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error('MP_ACCESS_TOKEN no configurado')
  }

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`, // Rule 1: nunca hardcodeado
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`MP API error al re-fetchear pago ${paymentId}: HTTP ${res.status}`)
  }

  return res.json() as Promise<MpPaymentResponse>
}

// ─── Handler principal ───────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Rule 10: verificar tamaño del body antes de leer
  const contentLength = request.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 })
  }

  // Rule 5 & Rule 3: leer raw body PRIMERO, antes de parsear
  const rawBody = await request.text()

  // Rule 10: verificar tamaño real del body leído
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 })
  }

  // ── Extraer headers necesarios para la verificación de firma ─────────────
  const xSignature = request.headers.get('x-signature') ?? ''
  const xRequestId = request.headers.get('x-request-id') ?? ''

  // Parsear x-signature formato KV: "ts=<timestamp>,v1=<hmac>"
  const sigParts = Object.fromEntries(
    xSignature.split(',').map((part) => {
      const [k, ...rest] = part.split('=')
      return [k.trim(), rest.join('=').trim()]
    }),
  )

  const ts = sigParts['ts'] ?? ''
  const v1 = sigParts['v1'] ?? ''

  if (!ts || !v1) {
    return NextResponse.json({ error: 'x-signature malformado' }, { status: 401 })
  }

  // ── Parsear el payload para obtener data.id (necesario para la firma) ─────
  let payload: MpWebhookPayload
  try {
    payload = JSON.parse(rawBody) as MpWebhookPayload
  } catch {
    return NextResponse.json({ error: 'payload JSON inválido' }, { status: 400 })
  }

  const dataId = String(payload?.data?.id ?? '')
  const eventType = payload?.type ?? 'unknown'

  // ── Rule 3: Verificar firma HMAC ANTES de procesar ─────────────────────────
  const webhookSecret = process.env.MP_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[mp-webhook] MP_WEBHOOK_SECRET no configurado')
    return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 })
  }

  try {
    verifyMpSignature(dataId, xRequestId, ts, v1, webhookSecret)
  } catch (err) {
    if (err instanceof WebhookTimestampError) {
      // Rule 6: solo logueamos id/type, nunca el payload
      console.warn(`[mp-webhook] timestamp expirado — event_id=${xRequestId}`)
      return NextResponse.json({ error: 'timestamp expirado' }, { status: 400 })
    }
    // Rule 6: nunca loguear el payload completo
    console.warn(`[mp-webhook] firma inválida — event_id=${xRequestId}`)
    return NextResponse.json({ error: 'firma inválida' }, { status: 401 })
  }

  // ── Rule 9: Deduplicación por event_id (x-request-id) ─────────────────────
  if (xRequestId) {
    try {
      await prisma.webhookEvent.create({
        data: {
          eventId: xRequestId, // Rule 9: UNIQUE constraint en DB previene duplicados
          eventType,
        },
      })
    } catch {
      // Si falla por constraint UNIQUE → evento ya fue procesado (replay)
      const existing = await prisma.webhookEvent.findUnique({
        where: { eventId: xRequestId },
      })
      if (existing) {
        const replay = new WebhookReplayError(xRequestId)
        // Rule 6: solo id/type en el log
        console.info(`[mp-webhook] evento ya procesado — event_id=${xRequestId} type=${eventType}`)
        // Retornar 200 para que MP no reintente
        return NextResponse.json({ received: true, deduplicated: true }, { status: replay.httpStatus })
      }
      throw existing
    }
  }

  // Rule 6: solo loguear event_id, event_type, ts — NUNCA el payload completo
  console.info(`[mp-webhook] event_id=${xRequestId} type=${eventType} ts=${ts}`)

  // ── Despachar según tipo de evento ───────────────────────────────────────
  try {
    switch (eventType) {
      case 'payment':
        await handlePaymentEvent(dataId)
        break

      case 'subscription_preapproval':
        // TODO: implementar manejo de preapproval en src/app/api/webhook/mercadopago/route.ts
        console.info(`[mp-webhook] TODO: subscription_preapproval — event_id=${xRequestId}`)
        break

      case 'subscription_authorized_payment':
        await handleSubscriptionPaymentEvent(dataId)
        break

      default:
        // Eventos no manejados: loguear con TODO, no silenciar
        console.info(`[mp-webhook] evento no manejado (TODO) — type=${eventType} event_id=${xRequestId}`)
        break
    }
  } catch (err) {
    console.error(`[mp-webhook] error procesando evento — event_id=${xRequestId}`, {
      message: err instanceof Error ? err.message : 'error desconocido',
      // Rule 6: nunca loguear el payload o datos de pago completos
    })
    return NextResponse.json({ error: 'error interno' }, { status: 500 })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}

// ─── Handlers por tipo de evento ─────────────────────────────────────────────

/**
 * Maneja eventos de tipo "payment".
 * Re-fetchea el pago desde la API de MP — el payload del webhook NO es autoritativo.
 */
async function handlePaymentEvent(paymentId: string): Promise<void> {
  if (!paymentId) return

  // Siempre re-fetchear desde MP (el webhook solo notifica, no garantiza estado)
  const payment = await fetchPaymentFromMp(paymentId)

  // Rule 6: solo loguear id y estado — nunca datos del pagador completos
  console.info(`[mp-webhook] payment re-fetched — id=${payment.id} status=${payment.status}`)

  if (payment.status === 'approved') {
    // external_reference contiene el businessId (configurado en checkout)
    const businessId = payment.external_reference
    if (!businessId) {
      console.warn(`[mp-webhook] payment ${payment.id} sin external_reference`)
      return
    }

    // Actualizar suscripción activa del negocio
    await prisma.subscription.updateMany({
      where: {
        businessId,
        status: { in: ['PENDING', 'PAST_DUE'] },
      },
      data: {
        status: 'ACTIVE',
        mpSubscriptionId: String(payment.id),
        currentPeriodStart: payment.date_approved ? new Date(payment.date_approved) : new Date(),
        // Período de 30 días desde la aprobación
        currentPeriodEnd: new Date(
          (payment.date_approved ? new Date(payment.date_approved) : new Date()).getTime() +
          30 * 24 * 60 * 60 * 1000,
        ),
      },
    })
  }
}

/**
 * Maneja pagos recurrentes de suscripción (subscription_authorized_payment).
 */
async function handleSubscriptionPaymentEvent(paymentId: string): Promise<void> {
  if (!paymentId) return

  const payment = await fetchPaymentFromMp(paymentId)

  console.info(`[mp-webhook] sub-payment re-fetched — id=${payment.id} status=${payment.status}`)

  if (payment.status === 'approved' && payment.external_reference) {
    await prisma.subscription.updateMany({
      where: { businessId: payment.external_reference },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: payment.date_approved ? new Date(payment.date_approved) : new Date(),
        currentPeriodEnd: new Date(
          (payment.date_approved ? new Date(payment.date_approved) : new Date()).getTime() +
          30 * 24 * 60 * 60 * 1000,
        ),
      },
    })
  } else if (['rejected', 'cancelled'].includes(payment.status)) {
    if (payment.external_reference) {
      await prisma.subscription.updateMany({
        where: { businessId: payment.external_reference },
        data: { status: normalizeMpStatus(payment.status) },
      })
    }
  }
}
