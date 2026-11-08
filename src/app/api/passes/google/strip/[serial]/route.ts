import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateStripPNG } from '@/lib/passkit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/passes/google/strip/{serial}?v={stamps}
// Returns a 1032×336 PNG with the 2-row coffee-cup stamp progress.
// The ?v= query param acts as a cache buster when stamps change.
export async function GET(
  _req: NextRequest,
  { params }: { params: { serial: string } }
) {
  const passRecord = await prisma.customerPass.findUnique({
    where: { serialNumber: params.serial },
    include: { program: true },
  })

  if (!passRecord) return new Response(null, { status: 404 })

  const buffer = await generateStripPNG(
    passRecord.currentStamps,
    passRecord.program.stampsRequired,
    passRecord.program.backgroundColor,
    passRecord.program.foregroundColor,
    1032, 336,
    passRecord.program.stampEmoji ?? '⭐',
  )

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type':  'image/png',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
