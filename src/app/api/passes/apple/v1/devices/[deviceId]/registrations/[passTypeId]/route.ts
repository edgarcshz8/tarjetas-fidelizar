import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_IDENTIFIER ?? 'pass.com.edgarcamposh.tarjetas-fidelizar'

// GET /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}?passesUpdatedSince=...
// passesUpdatedSince is a Unix timestamp in seconds (the exact string from a prior lastUpdated response).
// Returns serial numbers of passes updated after that tag, plus a new lastUpdated tag for next time.
export async function GET(
  req: NextRequest,
  { params }: { params: { deviceId: string; passTypeId: string } }
) {
  const sinceParam = req.nextUrl.searchParams.get('passesUpdatedSince')
  console.log(`[Apple v1/list] GET device=${params.deviceId.slice(0, 8)}… passType=${params.passTypeId} since=${sinceParam ?? 'all'}`)

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

  if (sinceParam) {
    // Apple sends back the exact lastUpdated string we gave it — a Unix seconds integer.
    const sinceSec = parseInt(sinceParam, 10)
    passes = passes.filter(p => Math.floor(p.applePassUpdatedAt.getTime() / 1000) > sinceSec)
  }

  if (passes.length === 0) {
    console.log('[Apple v1/list] 204 no updated passes')
    return new Response(null, { status: 204 })
  }

  // lastUpdated: Unix seconds of the most recently updated pass — Apple will echo this back
  // as passesUpdatedSince so we know exactly which updates the device already has.
  const maxUpdatedSec = Math.max(...passes.map(p => Math.floor(p.applePassUpdatedAt.getTime() / 1000)))
  const serials = passes.map(p => p.serialNumber)
  console.log(`[Apple v1/list] 200 updated serials: ${serials.join(', ')} lastUpdated=${maxUpdatedSec}`)
  return Response.json({
    serialNumbers: serials,
    lastUpdated: String(maxUpdatedSec),
  })
}
