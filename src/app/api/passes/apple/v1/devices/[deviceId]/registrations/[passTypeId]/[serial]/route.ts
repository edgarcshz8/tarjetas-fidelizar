import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_IDENTIFIER ?? 'pass.com.misstamps.loyalty'

// POST /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
// Body: { pushToken }
// iOS Wallet calls this when the pass is added to Wallet to subscribe to push updates.
export async function POST(
  req: NextRequest,
  { params }: { params: { deviceId: string; passTypeId: string; serial: string } }
) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('ApplePass ', '').trim()

  console.log(`[Apple v1/register] POST device=${params.deviceId.slice(0, 8)}… passType=${params.passTypeId} serial=${params.serial}`)

  if (params.passTypeId !== PASS_TYPE_ID) {
    console.log(`[Apple v1/register] 400 unknown passTypeId=${params.passTypeId}`)
    return new Response(null, { status: 400 })
  }

  let body: { pushToken?: string }
  try {
    body = await req.json()
  } catch {
    console.log('[Apple v1/register] 400 invalid JSON body')
    return new Response(null, { status: 400 })
  }

  const { pushToken } = body
  if (!pushToken) {
    console.log('[Apple v1/register] 400 missing pushToken')
    return new Response(null, { status: 400 })
  }

  const passRecord = await prisma.customerPass.findUnique({
    where: { serialNumber: params.serial },
  })

  if (!passRecord || passRecord.authToken !== token) {
    console.log(`[Apple v1/register] 401 auth mismatch serial=${params.serial}`)
    return new Response(null, { status: 401 })
  }

  const existing = await prisma.appleDevice.findUnique({
    where: {
      deviceLibraryIdentifier_passSerialNumber: {
        deviceLibraryIdentifier: params.deviceId,
        passSerialNumber: params.serial,
      },
    },
  })

  await prisma.appleDevice.upsert({
    where: {
      deviceLibraryIdentifier_passSerialNumber: {
        deviceLibraryIdentifier: params.deviceId,
        passSerialNumber: params.serial,
      },
    },
    update: { pushToken },
    create: {
      deviceLibraryIdentifier: params.deviceId,
      passSerialNumber: params.serial,
      pushToken,
    },
  })

  const statusCode = existing ? 200 : 201
  console.log(`[Apple v1/register] ${statusCode} device registered for serial=${params.serial}`)
  return new Response(null, { status: statusCode })
}

// DELETE /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
// iOS Wallet calls this when the pass is removed from Wallet.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { deviceId: string; passTypeId: string; serial: string } }
) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('ApplePass ', '').trim()

  console.log(`[Apple v1/unregister] DELETE device=${params.deviceId.slice(0, 8)}… serial=${params.serial}`)

  if (params.passTypeId !== PASS_TYPE_ID) {
    console.log(`[Apple v1/unregister] 400 unknown passTypeId=${params.passTypeId}`)
    return new Response(null, { status: 400 })
  }

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
