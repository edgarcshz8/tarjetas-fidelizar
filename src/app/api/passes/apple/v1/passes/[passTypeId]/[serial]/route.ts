import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateApplePass } from '@/lib/passkit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_IDENTIFIER ?? 'pass.com.misstamps.loyalty'

// GET /v1/passes/{passTypeIdentifier}/{serialNumber}
// Called by iOS Wallet after receiving an APNs push to fetch the updated pass.
export async function GET(
  req: NextRequest,
  { params }: { params: { passTypeId: string; serial: string } }
) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('ApplePass ', '').trim()

  console.log(`[Apple v1/passes] GET ${params.serial} passType=${params.passTypeId} auth=${token?.slice(0, 8)}…`)

  if (params.passTypeId !== PASS_TYPE_ID) {
    console.log(`[Apple v1/passes] 400 unknown passTypeId=${params.passTypeId}`)
    return new Response(null, { status: 400 })
  }

  const passRecord = await prisma.customerPass.findUnique({
    where: { serialNumber: params.serial },
    include: { customer: true, program: { include: { business: true } } },
  })

  if (!passRecord) {
    console.log(`[Apple v1/passes] 404 serial=${params.serial}`)
    return new Response(null, { status: 404 })
  }

  if (token !== passRecord.authToken) {
    console.log(`[Apple v1/passes] 401 token mismatch for serial=${params.serial}`)
    return new Response(null, { status: 401 })
  }

  // Respect If-Modified-Since — compare at second precision.
  // HTTP dates have no sub-second resolution; DB timestamps do. Without truncation,
  // a DB value like 02:01:58.123 is always "newer" than the HTTP date 02:01:58,
  // causing the server to always return the full pass instead of 304.
  const ifModSince = req.headers.get('if-modified-since')
  if (ifModSince) {
    const updatedSec = Math.floor(passRecord.applePassUpdatedAt.getTime() / 1000)
    const sinceSec   = Math.floor(new Date(ifModSince).getTime() / 1000)
    if (updatedSec <= sinceSec) {
      console.log(`[Apple v1/passes] 304 not modified serial=${params.serial}`)
      return new Response(null, { status: 304 })
    }
  }

  try {
    const passBuffer = await generateApplePass(passRecord as any)
    console.log(`[Apple v1/passes] 200 serial=${params.serial} stamps=${passRecord.currentStamps}/${passRecord.program.stampsRequired}`)

    // Truncate Last-Modified to second precision so future If-Modified-Since comparisons are consistent
    const lastModifiedDate = new Date(Math.floor(passRecord.applePassUpdatedAt.getTime() / 1000) * 1000)

    return new Response(new Uint8Array(passBuffer), {
      status: 200,
      headers: {
        'Content-Type':   'application/vnd.apple.pkpass',
        'Content-Length': String(passBuffer.length),
        'Last-Modified':  lastModifiedDate.toUTCString(),
        'Cache-Control':  'no-store, no-transform',
      },
    })
  } catch (err) {
    console.error(`[Apple v1/passes] 500 serial=${params.serial}`, err)
    return new Response(null, { status: 500 })
  }
}
