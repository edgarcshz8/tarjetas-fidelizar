import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_IDENTIFIER ?? 'pass.com.edgarcamposh.tarjetas-fidelizar'

// GET /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}?passesUpdatedSince=...
// Returns serial numbers of passes registered to this device that have been updated since the tag.
export async function GET(
  req: NextRequest,
  { params }: { params: { deviceId: string; passTypeId: string } }
) {
  const lastUpdated = req.nextUrl.searchParams.get('passesUpdatedSince')
  console.log(`[Apple v1/list] GET device=${params.deviceId.slice(0, 8)}… passType=${params.passTypeId} since=${lastUpdated ?? 'all'}`)

  if (params.passTypeId !== PASS_TYPE_ID) {
    console.log(`[Apple v1/list] 400 unknown passTypeId=${params.passTypeId}`)
    return new Response(null, { status: 400 })
  }

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
    console.log('[Apple v1/list] 204 no updated passes')
    return new Response(null, { status: 204 })
  }

  const serials = passes.map(p => p.serialNumber)
  console.log(`[Apple v1/list] 200 updated serials: ${serials.join(', ')}`)
  return Response.json({
    serialNumbers: serials,
    lastUpdated: new Date().toISOString(),
  })
}
