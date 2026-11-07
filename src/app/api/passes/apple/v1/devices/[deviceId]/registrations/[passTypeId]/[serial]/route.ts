import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// DELETE /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
// iOS Wallet calls this when the pass is removed from Wallet.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { deviceId: string; passTypeId: string; serial: string } }
) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('ApplePass ', '').trim()

  console.log(`[Apple v1/unregister] DELETE device=${params.deviceId.slice(0, 8)}… serial=${params.serial}`)

  const passRecord = await prisma.customerPass.findUnique({
    where: { serialNumber: params.serial },
  })

  if (!passRecord || passRecord.authToken !== token) {
    console.log(`[Apple v1/unregister] 401 auth mismatch serial=${params.serial}`)
    return new Response(null, { status: 401 })
  }

  await prisma.appleDevice.deleteMany({
    where: {
      deviceLibraryIdentifier: params.deviceId,
      passSerialNumber: params.serial,
    },
  })

  console.log(`[Apple v1/unregister] 200 device unregistered for serial=${params.serial}`)
  return new Response(null, { status: 200 })
}
