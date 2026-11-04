import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateApplePass } from '@/lib/passkit'

export const runtime = 'nodejs'

// GET /api/passes/apple/{serial} → Apple Wallet llama esto para obtener el pase actualizado
export async function GET(
  req: NextRequest,
  { params }: { params: { serial: string } }
) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('ApplePass ', '')

  const passRecord = await prisma.customerPass.findUnique({
    where: { serialNumber: params.serial },
    include: { customer: true, program: { include: { business: true } } },
  })

  if (!passRecord) {
    return new NextResponse(null, { status: 404 })
  }

  // Validar authToken de Apple
  if (token !== passRecord.authToken) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const passBuffer = await generateApplePass(passRecord as any)

    return new NextResponse(passBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Last-Modified': passRecord.applePassUpdatedAt.toUTCString(),
      },
    })
  } catch (err) {
    console.error('[GET /api/passes/apple/:serial]', err)
    return new NextResponse(null, { status: 500 })
  }
}
