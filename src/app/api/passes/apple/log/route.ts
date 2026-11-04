import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Apple Wallet envía logs de errores aquí
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('[Apple Wallet Log]', JSON.stringify(body))
  } catch {}
  return new NextResponse(null, { status: 200 })
}
