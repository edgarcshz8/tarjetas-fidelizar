import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateApplePass } from '@/lib/passkit'

export const runtime = 'nodejs'

function htmlError(title: string, detail: string, status: number): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>` +
    `<body style="font-family:sans-serif;padding:2rem"><h2>${title}</h2><p>${detail}</p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

// GET /api/passes/apple/{serial}/download?token={authToken} → descarga directa del .pkpass
// El token es requerido para prevenir enumeración de serials.
export async function GET(
  req: NextRequest,
  { params }: { params: { serial: string } }
) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return htmlError('Enlace inválido', 'Usa el enlace que recibiste al registrarte.', 401)
  }

  const passRecord = await prisma.customerPass.findFirst({
    where: { serialNumber: params.serial, authToken: token },
    include: { customer: true, program: { include: { business: true } } },
  })

  if (!passRecord) {
    return htmlError('Pase no encontrado', 'El enlace de descarga no es válido.', 404)
  }

  try {
    const passBuffer = await generateApplePass(passRecord as any)

    // Use native Response (not NextResponse) for binary data.
    // Content-Disposition: inline → iOS Safari intercepts the MIME type and opens Wallet directly.
    // Cache-Control: no-store, no-transform → prevents proxy/CDN from gzip-wrapping the ZIP.
    return new Response(new Uint8Array(passBuffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.apple.pkpass',
        'Content-Disposition': 'inline; filename="tarjeta-fidelizacion.pkpass"',
        'Content-Length':      String(passBuffer.length),
        'Cache-Control':       'no-store, no-transform',
      },
    })
  } catch (err: any) {
    console.error('[GET /api/passes/apple/:serial/download]', err)
    return htmlError('Error', 'No se puede generar el pase en este momento.', 500)
  }
}
