import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { pushPassUpdate } from '@/lib/apns'

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
    where: { id: { in: passes.map(p => p.id) } },
    data: { applePassUpdatedAt: new Date() },
  })

  // Send APNs push to each pass (fire-and-forget per pass, collect counts)
  const results = await Promise.allSettled(
    passes.map(p => pushPassUpdate(p.serialNumber))
  )

  const pushed    = results.filter(r => r.status === 'fulfilled').length
  const failed    = results.filter(r => r.status === 'rejected').length

  return NextResponse.json({ pushed, failed, total: passes.length })
}
