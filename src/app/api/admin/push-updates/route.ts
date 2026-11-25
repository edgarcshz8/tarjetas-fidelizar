import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { pushPassUpdate } from '@/lib/apns'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// POST /api/admin/push-updates
// Bumps applePassUpdatedAt on all active passes and sends APNs push to each device,
// so iOS Wallet re-downloads the pass with the latest data (e.g. updated geofencing coords).
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const rl = checkRateLimit(`push:${session.user.businessId}`, 1, 10 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Espera 10 minutos entre envíos masivos' }, { status: 429 })
  }

  // Find all active passes for this business
  const passes = await prisma.customerPass.findMany({
    where: { program: { businessId: session.user.businessId } },
    select: { id: true, serialNumber: true },
  })

  if (passes.length === 0) {
    return NextResponse.json({ pushed: 0 })
  }

  // Bump updatedAt so the If-Modified-Since check on /v1/passes passes through
  await prisma.customerPass.updateMany({
    where: { id: { in: passes.map((p: { id: string }) => p.id) } },
    data: { applePassUpdatedAt: new Date() },
  })

  // Send APNs push in batches of 100 to avoid APNS quota exhaustion
  const BATCH_SIZE = 100
  const results: PromiseSettledResult<void>[] = []
  for (let i = 0; i < passes.length; i += BATCH_SIZE) {
    const chunk = passes.slice(i, i + BATCH_SIZE)
    const chunkResults = await Promise.allSettled(
      chunk.map((p: { serialNumber: string }) => pushPassUpdate(p.serialNumber))
    )
    results.push(...chunkResults)
    if (i + BATCH_SIZE < passes.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  const pushed = results.filter((r): r is PromiseFulfilledResult<void> => r.status === 'fulfilled').length
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').length

  return NextResponse.json({ pushed, failed, total: passes.length })
}
