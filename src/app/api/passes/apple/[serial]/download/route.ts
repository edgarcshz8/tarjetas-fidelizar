import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateApplePass } from '@/lib/passkit'

export const runtime = 'nodejs'

// GET /api/passes/apple/{serial}/download → descarga directa del .pkpass
export async function GET(
  _req: NextRequest,
  { params }: { params: { serial: string } }
) {
  const passRecord = await prisma.customerPass.findUnique({
    where: { serialNumber: params.serial },
    include: { customer: true, program: { include: { business: true } } },
  })

  if (!passRecord) {
    return new NextResponse('Pase no encontrado', { status: 404 })
  }

  try {
    const passBuffer = await generateApplePass(passRecord as any)

    return new NextResponse(new Uint8Array(passBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="tarjeta-fidelizacion.pkpass"`,
      },
    })
  } catch (err: any) {
    console.error('[GET /api/passes/apple/:serial/download]', err)
    // Si los certificados no están configurados, devolver error descriptivo
    if (err.message?.includes('ENOENT') || err.message?.includes('cert')) {
      return new NextResponse(
        'Certificados de Apple Wallet no configurados. Ver .env.example',
        { status: 503 }
      )
    }
    return new NextResponse('Error generando el pase', { status: 500 })
  }
}
