/**
 * PagoKit — errores tipados para Mercado Pago
 * Archivo de datos puros (sin side effects).
 */

// Rule 11: Colectamos el mínimo de PII necesario. Nunca loguear datos de pago completos.

export class MercadoPagoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message)
    this.name = 'MercadoPagoError'
  }
}

export class WebhookSignatureError extends MercadoPagoError {
  constructor(detail?: string) {
    super('WEBHOOK_SIGNATURE_INVALID', `Firma de webhook inválida${detail ? `: ${detail}` : ''}`, 401)
    this.name = 'WebhookSignatureError'
  }
}

export class WebhookReplayError extends MercadoPagoError {
  constructor(eventId: string) {
    super('WEBHOOK_REPLAY', `Evento ya procesado: ${eventId}`, 200)
    this.name = 'WebhookReplayError'
  }
}

export class WebhookTimestampError extends MercadoPagoError {
  constructor(ageSecs: number) {
    super('WEBHOOK_TIMESTAMP_EXPIRED', `Timestamp del webhook expirado (${ageSecs}s > 300s)`, 400)
    this.name = 'WebhookTimestampError'
  }
}

export class CheckoutError extends MercadoPagoError {
  constructor(message: string, httpStatus?: number) {
    super('CHECKOUT_FAILED', message, httpStatus)
    this.name = 'CheckoutError'
  }
}

/** Códigos de estado de suscripción normalizados (MP usa strings en inglés) */
export type NormalizedSubStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'PAUSED'

export function normalizeMpStatus(mpStatus: string | undefined | null): NormalizedSubStatus {
  switch ((mpStatus ?? '').toLowerCase()) {
    case 'authorized':
    case 'active':
      return 'ACTIVE'
    case 'paused':
      return 'PAUSED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELED'
    case 'pending':
    case 'created':
      return 'PENDING'
    default:
      return 'PAST_DUE'
  }
}
