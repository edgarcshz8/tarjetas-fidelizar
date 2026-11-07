import { prisma } from '@/lib/prisma'

// APNs provider singleton — built once per process, reused across all requests.
// Using a Promise so concurrent first-calls share the same initialization.
let _providerPromise: Promise<{ provider: any; passTypeId: string } | null> | null = null

function getProvider(): Promise<{ provider: any; passTypeId: string } | null> {
  if (!_providerPromise) _providerPromise = buildProvider()
  return _providerPromise
}

async function buildProvider(): Promise<{ provider: any; passTypeId: string } | null> {
  const passTypeId = process.env.APPLE_PASS_TYPE_IDENTIFIER
  if (!passTypeId) {
    console.warn('[APNS] APPLE_PASS_TYPE_IDENTIFIER not set — push disabled')
    return null
  }

  const certB64   = process.env.APPLE_CERT_B64
  const keyB64    = process.env.APPLE_KEY_B64
  const apnKeyB64 = process.env.APPLE_APN_KEY_B64
  const apnKeyId  = process.env.APPLE_APN_KEY_ID
  const teamId    = process.env.APPLE_TEAM_IDENTIFIER

  const hasCertAuth  = !!(certB64 && keyB64)
  const hasTokenAuth = !!(apnKeyB64 && apnKeyId && teamId)

  if (!hasCertAuth && !hasTokenAuth) {
    console.warn('[APNS] no credentials — set APPLE_CERT_B64+APPLE_KEY_B64 or APPLE_APN_KEY_B64+APPLE_APN_KEY_ID')
    return null
  }

  const apn = await import('@parse/node-apn')
  let opts: Record<string, unknown>

  if (hasCertAuth) {
    // @parse/node-apn v7 reads `cert` and `key` as Buffer/PEM string.
    // Keys named certData/keyData are silently ignored → provider falls back to
    // reading "cert.pem" from disk, which doesn't exist in Docker.
    const cert = Buffer.from(certB64!, 'base64').toString('utf8')
    const key  = Buffer.from(keyB64!,  'base64').toString('utf8')

    if (!cert.startsWith('-----BEGIN')) {
      console.error('[APNS] APPLE_CERT_B64 did not decode to a PEM certificate — verify the env var')
      return null
    }
    if (!key.startsWith('-----BEGIN')) {
      console.error('[APNS] APPLE_KEY_B64 did not decode to a PEM key — verify the env var')
      return null
    }

    opts = {
      cert,
      key,
      // Wallet passes always use APNs production endpoint, regardless of NODE_ENV
      production: true,
    }
    if (process.env.APPLE_KEY_PASSPHRASE) opts.passphrase = process.env.APPLE_KEY_PASSPHRASE
    console.log('[APNS] provider initialized — certificate-based auth (Pass Type ID cert)')
  } else {
    const key = Buffer.from(apnKeyB64!, 'base64').toString('utf8')
    if (!key.startsWith('-----BEGIN')) {
      console.error('[APNS] APPLE_APN_KEY_B64 did not decode to a PEM key — verify the env var')
      return null
    }
    opts = {
      token: { key, keyId: apnKeyId!, teamId: teamId! },
      production: true,
    }
    console.log('[APNS] provider initialized — token-based auth (.p8 key)')
  }

  return { provider: new apn.default.Provider(opts as any), passTypeId }
}

// Sends an empty APNs push to every registered device for the given pass serial.
// iOS Wallet receives it and calls GET /v1/passes/{passTypeId}/{serial} to fetch the update.
export async function pushPassUpdate(serialNumber: string): Promise<void> {
  const ctx = await getProvider()
  if (!ctx) return

  const devices = await prisma.appleDevice.findMany({
    where: { passSerialNumber: serialNumber },
  })

  if (devices.length === 0) {
    console.log(`[APNS] no registered devices for serial=${serialNumber}`)
    return
  }

  console.log(`[APNS] pushing to ${devices.length} device(s) for serial=${serialNumber}`)

  const apn = await import('@parse/node-apn')
  const notification = new apn.default.Notification()
  // Topic MUST be exactly the passTypeIdentifier — no ".voip" or any suffix
  notification.topic    = ctx.passTypeId
  notification.priority = 10
  // @parse/node-apn skips writing the HTTP body entirely when compile() returns "{}":
  //   client.js: if (notification.body !== '{}') { request.write(notification.body) }
  // Apple receives an empty body and responds 400 PayloadEmpty.
  // rawPayload = { aps: {} } compiles to '{"aps":{}}', passes the check, and is a
  // valid Apple Wallet pass-update payload (empty aps dict is accepted by APNs).
  ;(notification as any).rawPayload = { aps: {} }
  // apns-push-type: background — required by iOS 13+ for Wallet pass update signals
  ;(notification as any).pushType = 'background'

  console.log('[APNS] body', (notification as any).compile())

  for (const device of devices) {
    try {
      const result = await ctx.provider.send(notification, device.pushToken)

      if (result.sent.length > 0) {
        console.log(`[APNS] ✓ sent device=${device.deviceLibraryIdentifier.slice(0, 8)}…`)
      }

      if (result.failed.length > 0) {
        const f       = result.failed[0]
        const status  = (f as any).status  as number | undefined
        const reason  = (f as any).response?.reason ?? (f as any).error
        console.error(`[APNS] ✗ failed device=${device.deviceLibraryIdentifier.slice(0, 8)}… status=${status} reason=${reason}`)

        // 410 or explicit stale-token reasons → remove the registration
        if (status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') {
          console.log(`[APNS] removing stale device=${device.deviceLibraryIdentifier.slice(0, 8)}…`)
          await prisma.appleDevice.delete({ where: { id: device.id } }).catch(() => {})
        }
      }
    } catch (err) {
      console.error(`[APNS] send error device=${device.deviceLibraryIdentifier.slice(0, 8)}…`, err)
    }
  }
}
