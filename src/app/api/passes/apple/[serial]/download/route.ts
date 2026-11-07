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
    return htmlError('Pase no encontrado', `Serial: ${params.serial}`, 404)
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

    if (err.message?.includes('ENOENT')) {
      return htmlError(
        'Certificados no encontrados',
        'Los archivos de certificado de Apple Wallet no están configurados en el servidor. ' +
        'Configura APPLE_CERT_B64, APPLE_KEY_B64 y APPLE_WWDR_B64 en las variables de entorno.',
        503,
      )
    }

    if (err.message?.includes('PEM') || err.message?.includes('cert') || err.message?.includes('sign')) {
      return htmlError(
        'Error de certificado',
        `El certificado de Apple Wallet no es válido: ${err.message}`,
        503,
      )
    }

    return htmlError(
      'Error generando el pase',
      `Detalle: ${err.message ?? 'error desconocido'}`,
      500,
    )
  }
}
