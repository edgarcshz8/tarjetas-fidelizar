import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// POST → el dispositivo se registra para recibir push updates de los pases
export async function POST(
  req: NextRequest,
  { params }: { params: { deviceId: string; passTypeId: string } }
) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('ApplePass ', '')

  const body = await req.json()
  const { pushToken, serialNumber } = body

  if (!pushToken || !serialNumber) {
    return new NextResponse(null, { status: 400 })
  }

  const passRecord = await prisma.customerPass.findUnique({
    where: { serialNumber },
  })

  if (!passRecord || passRecord.authToken !== token) {
    return new NextResponse(null, { status: 401 })
  }

  await prisma.appleDevice.upsert({
    where: {
      deviceLibraryIdentifier_passSerialNumber: {
        deviceLibraryIdentifier: params.deviceId,
        passSerialNumber: serialNumber,
      },
    },
    update: { pushToken },
    create: {
      deviceLibraryIdentifier: params.deviceId,
      passSerialNumber: serialNumber,
      pushToken,
    },
  })

  return new NextResponse(null, { status: 201 })
}

// GET → retorna los seriales de pases actualizados desde lastUpdated
export async function GET(
  req: NextRequest,
  { params }: { params: { deviceId: string; passTypeId: string } }
) {
  const lastUpdated = req.nextUrl.searchParams.get('passesUpdatedSince')

  const devices = await prisma.appleDevice.findMany({
    where: { deviceLibraryIdentifier: params.deviceId },
    include: {
      pass: {
        select: {
          serialNumber: true,
          applePassUpdatedAt: true,
        },
      },
    },
  })

  let passes = devices.map(d => d.pass)

  if (lastUpdated) {
    const since = new Date(lastUpdated)
    passes = passes.filter(p => p.applePassUpdatedAt > since)
  }

  if (passes.length === 0) {
    return new NextResponse(null, { status: 204 })
  }

  return NextResponse.json({
    serialNumbers: passes.map(p => p.serialNumber),
    lastUpdated: new Date().toISOString(),
  })
}
