import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

// POST /v1/log
// Apple Wallet sends diagnostic messages here — log everything for debugging.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.error('[Apple Wallet Log]', JSON.stringify(body, null, 2))
  } catch (e) {
    console.error('[Apple Wallet Log] could not parse body', e)
  }
  return new Response(null, { status: 200 })
}
