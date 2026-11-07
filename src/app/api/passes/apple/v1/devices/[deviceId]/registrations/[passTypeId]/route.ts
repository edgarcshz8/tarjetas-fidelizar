import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// POST /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}
// Body: { pushToken, serialNumber }
// iOS Wallet calls this to register a device so it can receive push updates.
export async function POST(
  req: NextRequest,
  { params }: { params: { deviceId: string; passTypeId: string } }
) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('ApplePass ', '').trim()

  let body: { pushToken?: string; serialNumber?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(null, { status: 400 })
  }

  const { pushToken, serialNumber } = body
  console.log(`[Apple v1/register] POST device=${params.deviceId.slice(0, 8)}… serial=${serialNumber}`)

  if (!pushToken || !serialNumber) {
    console.log('[Apple v1/register] 400 missing pushToken or serialNumber')
    return new Response(null, { status: 400 })
  }

  const passRecord = await prisma.customerPass.findUnique({
    where: { serialNumber },
  })

  if (!passRecord || passRecord.authToken !== token) {
    console.log(`[Apple v1/register] 401 auth mismatch serial=${serialNumber}`)
    return new Response(null, { status: 401 })
  }

  const existing = await prisma.appleDevice.findUnique({
    where: {
      deviceLibraryIdentifier_passSerialNumber: {
        deviceLibraryIdentifier: params.deviceId,
        passSerialNumber: serialNumber,
      },
    },
  })

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

  const statusCode = existing ? 200 : 201
  console.log(`[Apple v1/register] ${statusCode} device registered for serial=${serialNumber}`)
  return new Response(null, { status: statusCode })
}

// GET /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}?passesUpdatedSince=...
// Returns serial numbers of passes that have been updated since the given date.
export async function GET(
  req: NextRequest,
  { params }: { params: { deviceId: string; passTypeId: string } }
) {
  const lastUpdated = req.nextUrl.searchParams.get('passesUpdatedSince')
  console.log(`[Apple v1/register] GET device=${params.deviceId.slice(0, 8)}… since=${lastUpdated ?? 'all'}`)

  const devices = await prisma.appleDevice.findMany({
    where: { deviceLibraryIdentifier: params.deviceId },
    include: {
      pass: { select: { serialNumber: true, applePassUpdatedAt: true } },
    },
  })

  let passes = devices.map(d => d.pass)

  if (lastUpdated) {
    const since = new Date(lastUpdated)
    passes = passes.filter(p => p.applePassUpdatedAt > since)
  }

  if (passes.length === 0) {
    console.log('[Apple v1/register] 204 no updated passes')
    return new Response(null, { status: 204 })
  }

  const serials = passes.map(p => p.serialNumber)
  console.log(`[Apple v1/register] 200 updated serials: ${serials.join(', ')}`)
  return Response.json({
    serialNumbers: serials,
    lastUpdated: new Date().toISOString(),
  })
}
