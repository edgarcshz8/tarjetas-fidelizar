import crypto from 'crypto'

/**
 * Construye el manifest que Mercado Pago firma con HMAC-SHA256.
 *
 * Formato oficial:
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * Reglas:
 *   - id: desde query param (NO desde el body). Si es alfanumérico, se pasa a minúsculas.
 *   - request-id: solo se incluye si el header existe y no está vacío.
 *   - ts: desde el campo ts del header x-signature.
 *   - Cada segmento termina en ";".
 */
export function buildWebhookManifest(dataId: string, xReqId: string, ts: string): string {
  const normalizedId = /^[a-zA-Z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId
  const parts = [`id:${normalizedId}`]
  if (xReqId) parts.push(`request-id:${xReqId}`)
  parts.push(`ts:${ts}`)
  return parts.join(';') + ';'
}

/**
 * Calcula el HMAC-SHA256 del manifest y lo compara en tiempo constante
 * con el valor recibido (v1 del header x-signature).
 * Devuelve true si coincide, false si no.
 */
export function verifyWebhookHmac(secret: string, manifest: string, receivedV1: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected,    'hex'),
      Buffer.from(receivedV1,  'hex'),
    )
  } catch {
    // timingSafeEqual lanza RangeError si los buffers tienen distinto largo
    return false
  }
}
