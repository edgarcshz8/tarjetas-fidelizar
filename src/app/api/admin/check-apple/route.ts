import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'

function certStatus(b64Var: string | undefined, pathVar: string | undefined, label: string) {
  if (b64Var) {
    try {
      const buf = Buffer.from(b64Var, 'base64')
      const pem = buf.toString('utf8')
      const valid = pem.includes('-----BEGIN')
      return { label, source: 'base64_env', bytes: buf.length, valid, error: valid ? null : 'No PEM header found after base64 decode' }
    } catch (e) {
      return { label, source: 'base64_env', bytes: 0, valid: false, error: String(e) }
    }
  }
  if (pathVar) {
    return { label, source: 'file_path', path: pathVar, valid: false, error: 'File path set but no base64 — will fail in Docker (no certs/ folder in image)' }
  }
  return { label, source: 'missing', valid: false, error: `Neither ${label}_B64 nor ${label}_PATH is set` }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const checks = {
    passTypeIdentifier: {
      value: process.env.APPLE_PASS_TYPE_IDENTIFIER ? `${process.env.APPLE_PASS_TYPE_IDENTIFIER.slice(0, 20)}…` : null,
      valid: !!process.env.APPLE_PASS_TYPE_IDENTIFIER,
    },
    teamIdentifier: {
      value: process.env.APPLE_TEAM_IDENTIFIER || null,
      valid: !!process.env.APPLE_TEAM_IDENTIFIER,
    },
    appUrl: {
      value: process.env.APP_URL || 'http://localhost:3000 (default)',
      valid: !!process.env.APP_URL,
    },
    keyPassphrase: {
      set: !!process.env.APPLE_KEY_PASSPHRASE,
    },
    wwdr:       certStatus(process.env.APPLE_WWDR_B64,  process.env.APPLE_WWDR_PATH,  'APPLE_WWDR'),
    signerCert: certStatus(process.env.APPLE_CERT_B64,  process.env.APPLE_CERT_PATH,  'APPLE_CERT'),
    signerKey:  certStatus(process.env.APPLE_KEY_B64,   process.env.APPLE_KEY_PATH,   'APPLE_KEY'),
    apns: {
      keyId:   process.env.APPLE_APN_KEY_ID  ? `${process.env.APPLE_APN_KEY_ID.slice(0, 6)}…` : null,
      keyB64:  !!process.env.APPLE_APN_KEY_B64,
      keyPath: process.env.APPLE_APN_KEY_PATH || null,
      configured: !!(process.env.APPLE_APN_KEY_B64 || process.env.APPLE_APN_KEY_PATH) && !!process.env.APPLE_APN_KEY_ID,
    },
  }

  const allValid =
    checks.passTypeIdentifier.valid &&
    checks.teamIdentifier.valid &&
    checks.wwdr.valid &&
    checks.signerCert.valid &&
    checks.signerKey.valid

  return NextResponse.json({ ok: allValid, checks })
}
