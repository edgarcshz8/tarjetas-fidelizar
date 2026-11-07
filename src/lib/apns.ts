import { prisma } from '@/lib/prisma'

// Sends an empty APNs push to every registered device for the given pass serial.
// iOS Wallet receives it and calls GET /v1/passes/{passTypeId}/{serial} to fetch the update.
//
// Auth priority:
//   1. Certificate-based (APPLE_CERT_B64 + APPLE_KEY_B64) — same cert as the Pass Type ID
//   2. Token-based JWT (APPLE_APN_KEY_B64 + APPLE_APN_KEY_ID) — legacy / fallback
//
// If neither is configured, push is skipped (pass updates on next manual open).
export async function pushPassUpdate(serialNumber: string): Promise<void> {
  const passTypeIdentifier = process.env.APPLE_PASS_TYPE_IDENTIFIER
  if (!passTypeIdentifier) {
    console.warn('[APNS] APPLE_PASS_TYPE_IDENTIFIER not set — skipping push')
    return
  }

  const devices = await prisma.appleDevice.findMany({
    where: { passSerialNumber: serialNumber },
  })

  if (devices.length === 0) {
    console.log(`[APNS] no registered devices for serial=${serialNumber}`)
    return
  }

  console.log(`[APNS] pushing to ${devices.length} device(s) for serial=${serialNumber}`)

  // ── Build credentials ──────────────────────────────────────────────────────
  const certB64 = process.env.APPLE_CERT_B64
  const keyB64  = process.env.APPLE_KEY_B64

  const apnKeyB64 = process.env.APPLE_APN_KEY_B64
  const apnKeyId  = process.env.APPLE_APN_KEY_ID
  const teamId    = process.env.APPLE_TEAM_IDENTIFIER

  const hasCertAuth  = !!(certB64 && keyB64)
  const hasTokenAuth = !!(apnKeyB64 && apnKeyId && teamId)

  if (!hasCertAuth && !hasTokenAuth) {
    console.warn('[APNS] no credentials configured — set APPLE_CERT_B64+APPLE_KEY_B64 or APPLE_APN_KEY_B64+APPLE_APN_KEY_ID')
    return
  }

  try {
    const apn = await import('@parse/node-apn')

    let providerOptions: Record<string, unknown>

    if (hasCertAuth) {
      // Certificate-based auth using the Pass Type ID cert (same as signing cert)
      providerOptions = {
        certData:   Buffer.from(certB64!, 'base64'),
        keyData:    Buffer.from(keyB64!,  'base64'),
        production: process.env.NODE_ENV === 'production',
      }
      if (process.env.APPLE_KEY_PASSPHRASE) {
        providerOptions.passphrase = process.env.APPLE_KEY_PASSPHRASE
      }
      console.log('[APNS] using certificate-based auth (Pass Type ID cert)')
    } else {
      // Token-based JWT auth (.p8 key)
      providerOptions = {
        token: {
          key:    Buffer.from(apnKeyB64!, 'base64'),
          keyId:  apnKeyId!,
          teamId: teamId!,
        },
        production: process.env.NODE_ENV === 'production',
      }
      console.log('[APNS] using token-based auth (.p8 key)')
    }

    const provider = new apn.default.Provider(providerOptions as any)

    const notification = new apn.default.Notification()
    // Topic MUST be exactly the passTypeIdentifier — no ".voip" or any suffix
    notification.topic    = passTypeIdentifier
    notification.priority = 10
    notification.payload  = {}
    // apns-push-type: background — required by iOS 13+ for Wallet pass update signals
    ;(notification as any).pushType = 'background'

    for (const device of devices) {
      try {
        const result = await provider.send(notification, device.pushToken)
        if (result.sent.length > 0) {
          console.log(`[APNS] ✓ push sent to device=${device.deviceLibraryIdentifier.slice(0, 8)}…`)
        }
        if (result.failed.length > 0) {
          const f = result.failed[0]
          console.error(`[APNS] ✗ push failed device=${device.deviceLibraryIdentifier.slice(0, 8)}… status=${(f as any).status} error=${(f as any).error ?? (f as any).response?.reason}`)
          // If the token is invalid/expired, remove the device registration
          const reason = (f as any).response?.reason ?? (f as any).error
          if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
            console.log(`[APNS] removing stale device registration for token=${device.pushToken.slice(0, 12)}…`)
            await prisma.appleDevice.delete({ where: { id: device.id } }).catch(() => {})
          }
        }
      } catch (err) {
        console.error(`[APNS] send error for device=${device.deviceLibraryIdentifier.slice(0, 8)}…`, err)
      }
    }

    provider.shutdown()
  } catch (err) {
    console.error('[APNS] provider error:', err)
  }
}
