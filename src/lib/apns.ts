import { prisma } from '@/lib/prisma'

// Push updates de Apple Wallet via APNS.
// Para activar: agregar certs/apn_key.p8 y configurar env vars APPLE_APN_*.
// Sin configurar, los pases se actualizan la próxima vez que el cliente los abre.

export async function pushPassUpdate(serialNumber: string): Promise<void> {
  const keyPath = process.env.APPLE_APN_KEY_PATH
  const keyId = process.env.APPLE_APN_KEY_ID
  const teamId = process.env.APPLE_TEAM_IDENTIFIER

  if (!keyPath || !keyId || !teamId) {
    return
  }

  try {
    const apn = await import('@parse/node-apn')

    const provider = new apn.default.Provider({
      token: {
        key: keyPath,
        keyId,
        teamId,
      },
      production: process.env.NODE_ENV === 'production',
    })

    const devices = await prisma.appleDevice.findMany({
      where: { passSerialNumber: serialNumber },
    })

    if (devices.length > 0) {
      const notification = new apn.default.Notification()
      notification.topic = `${process.env.APPLE_PASS_TYPE_IDENTIFIER}.voip`
      ;(notification as any).pushType = 'background'
      notification.priority = 5

      for (const device of devices) {
        await provider.send(notification, device.pushToken).catch(() => {})
      }
    }

    provider.shutdown()
  } catch {
    // @parse/node-apn no disponible o error de config — ignorar
  }
}
