import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// DELETE → el dispositivo cancela la recepción de updates para un pase
export async function DELETE(
  req: NextRequest,
  { params }: { params: { deviceId: string; passTypeId: string; serial: string } }
) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('ApplePass ', '')

  const passRecord = await prisma.customerPass.findUnique({
    where: { serialNumber: params.serial },
  })

  if (!passRecord || passRecord.authToken !== token) {
    return new NextResponse(null, { status: 401 })
  }

  await prisma.appleDevice.deleteMany({
    where: {
      deviceLibraryIdentifier: params.deviceId,
      passSerialNumber: params.serial,
    },
  })

  return new NextResponse(null, { status: 200 })
}
