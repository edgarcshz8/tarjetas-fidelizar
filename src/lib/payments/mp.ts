// SECURITY_RULES applied in this file:
//   Rule 8:  Log only event id/type — never payer credentials or card data
//   Rule 11: Minimum PII — mask payer email in logs
//   Rule 12: No CVV, PAN, or track-data stored or referenced

import MercadoPagoConfig from 'mercadopago'
import { MercadoPagoApiError } from './errors'

export function getMpClient(): MercadoPagoConfig {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new MercadoPagoApiError('MP_ACCESS_TOKEN is not set.')
  return new MercadoPagoConfig({ accessToken })
}

/** Extracts status/message/cause from an MP SDK error without leaking the access token. */
export function extractMpError(err: unknown): { status: number; message: string; cause?: unknown } {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    const status = typeof e['status'] === 'number' ? e['status'] : 502
    const message = typeof e['message'] === 'string' ? e['message'] : 'Unknown MP error'
    const cause = e['cause'] ?? e['error'] ?? undefined
    return { status, message, cause }
  }
  return { status: 502, message: String(err) }
}

/** Masks an email for safe log output: edgar@gmail.com → ed***@gmail.com */
export function maskEmail(email: string): string {
  return email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
}

const CARD_REJECTION: Record<string, string> = {
  cc_rejected_bad_filled_card_number: 'Revisa el número de tarjeta.',
  cc_rejected_bad_filled_date: 'Revisa la fecha de vencimiento.',
  cc_rejected_bad_filled_other: 'Revisa los datos de la tarjeta.',
  cc_rejected_bad_filled_security_code: 'Revisa el código de seguridad (CVV).',
  cc_rejected_blacklist: 'No pudimos procesar tu pago.',
  cc_rejected_call_for_authorize: 'Llama a tu banco para autorizar el pago.',
  cc_rejected_card_disabled: 'Llama a tu banco para activar tu tarjeta.',
  cc_rejected_duplicated_payment: 'Ya realizaste un pago con ese monto. Espera unos minutos.',
  cc_rejected_high_risk: 'No pudimos procesar tu pago.',
  cc_rejected_insufficient_amount: 'Tu tarjeta no tiene fondos suficientes.',
  cc_rejected_invalid_installments: 'Tu tarjeta no admite la cantidad de cuotas seleccionada.',
  cc_rejected_max_attempts: 'Alcanzaste el límite de intentos permitidos.',
  cc_rejected_other_reason: 'No pudimos procesar tu pago. Intenta con otra tarjeta.',
  invalid_token: 'El token de tarjeta no es válido. Intenta de nuevo.',
  token_expired: 'El token de tarjeta expiró. Vuelve a ingresar los datos.',
}

/** Maps an MP error cause array or message to a user-facing Spanish rejection message. */
export function mapMpCardRejection(cause: unknown, messageFallback: string): string {
  if (Array.isArray(cause)) {
    for (const c of cause) {
      if (c && typeof c === 'object') {
        const code = (c as Record<string, unknown>)['code']
        if (typeof code === 'string' && CARD_REJECTION[code]) return CARD_REJECTION[code]
      }
    }
  }
  for (const [key, msg] of Object.entries(CARD_REJECTION)) {
    if (messageFallback.toLowerCase().includes(key)) return msg
  }
  return 'No pudimos procesar tu pago. Revisa los datos de la tarjeta e intenta de nuevo.'
}
