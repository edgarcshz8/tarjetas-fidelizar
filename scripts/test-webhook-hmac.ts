/**
 * Test unitario para la verificación HMAC del webhook de Mercado Pago.
 * Ejecutar: npx tsx scripts/test-webhook-hmac.ts
 */

import assert from 'assert/strict'
import { buildWebhookManifest, verifyWebhookHmac } from '../src/lib/payments/mp-webhook-verify'

const SECRET     = 'test-webhook-secret-key'
const DATA_ID    = '189093593281'
const REQUEST_ID = '7aad420f-4bd1-490d-a767-f75561bd18dc'
const TS         = '1794941982'

// ── 1. Formato del manifest ───────────────────────────────────────────────────

const manifestWith = buildWebhookManifest(DATA_ID, REQUEST_ID, TS)
assert.equal(
  manifestWith,
  `id:${DATA_ID};request-id:${REQUEST_ID};ts:${TS};`,
  'manifest con request-id',
)

const manifestWithout = buildWebhookManifest(DATA_ID, '', TS)
assert.equal(
  manifestWithout,
  `id:${DATA_ID};ts:${TS};`,
  'manifest sin request-id (header ausente)',
)

// ── 2. Normalización a minúsculas cuando el id es alfanumérico ────────────────

const manifestAlpha = buildWebhookManifest('ABC123DEF', REQUEST_ID, TS)
assert.ok(manifestAlpha.startsWith('id:abc123def;'), 'id alfanumérico pasa a minúsculas')

// id con guión — NO se normaliza
const manifestDash = buildWebhookManifest('AB-123', REQUEST_ID, TS)
assert.ok(manifestDash.startsWith('id:AB-123;'), 'id con guión no se normaliza')

// ── 3. HMAC correcto — vectores dorados ───────────────────────────────────────

const HMAC_WITH    = '384245283e68fee494263735d534d270486930c1535f0c22ae37afa5de4cf296'
const HMAC_WITHOUT = 'f4b3732bbb1d759730fed7dfc9308ebf872e1ceba5ae81280257e215a2a1ca66'

assert.ok(
  verifyWebhookHmac(SECRET, manifestWith, HMAC_WITH),
  'HMAC válido con request-id',
)
assert.ok(
  verifyWebhookHmac(SECRET, manifestWithout, HMAC_WITHOUT),
  'HMAC válido sin request-id',
)

// ── 4. HMAC incorrecto ────────────────────────────────────────────────────────

assert.ok(
  !verifyWebhookHmac(SECRET, manifestWith, HMAC_WITHOUT),
  'HMAC incorrecto rechazado (sin request-id en manifest pero recibido con)',
)
assert.ok(
  !verifyWebhookHmac(SECRET, manifestWith, 'deadbeef'),
  'HMAC truncado rechazado sin RangeError',
)
assert.ok(
  !verifyWebhookHmac(SECRET, manifestWith, 'zzzz'),
  'HMAC inválido (hex incorrecto) rechazado sin excepción',
)

// ── 5. Dos notificaciones mismo id/ts, distintos request-id → HMACs distintos ─

const rId2  = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff'
const m1    = buildWebhookManifest(DATA_ID, REQUEST_ID, TS)
const m2    = buildWebhookManifest(DATA_ID, rId2, TS)
assert.notEqual(m1, m2, 'manifests distintos para distintos request-id')

console.log('✓ Todos los tests del webhook HMAC pasaron')
