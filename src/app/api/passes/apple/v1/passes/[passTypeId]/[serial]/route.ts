import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateApplePass } from '@/lib/passkit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_IDENTIFIER ?? 'pass.com.edgarcamposh.tarjetas-fidelizar'

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

  // Respect If-Modified-Since — return 304 if pass has not changed
  const ifModSince = req.headers.get('if-modified-since')
  if (ifModSince) {
    const since = new Date(ifModSince)
    if (passRecord.applePassUpdatedAt <= since) {
      console.log(`[Apple v1/passes] 304 not modified serial=${params.serial}`)
      return new Response(null, { status: 304 })
    }
  }

  try {
    const passBuffer = await generateApplePass(passRecord as any)
    console.log(`[Apple v1/passes] 200 serial=${params.serial} stamps=${passRecord.currentStamps}/${passRecord.program.stampsRequired}`)

    return new Response(new Uint8Array(passBuffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.apple.pkpass',
        'Content-Length':      String(passBuffer.length),
        'Last-Modified':       passRecord.applePassUpdatedAt.toUTCString(),
        'Cache-Control':       'no-store, no-transform',
      },
    })
  } catch (err) {
    console.error(`[Apple v1/passes] 500 serial=${params.serial}`, err)
    return new Response(null, { status: 500 })
  }
}
