import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// GET → estadísticas del dashboard
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [totalCustomers, totalStamps, totalRewards, pendingRewards] = await Promise.all([
    prisma.customerPass.count({
      where: { program: { businessId: session.user.businessId } },
    }),
    prisma.stamp.count({
      where: { pass: { program: { businessId: session.user.businessId } } },
    }),
    prisma.customerPass.aggregate({
      where: { program: { businessId: session.user.businessId } },
      _sum: { totalRewardsEarned: true },
    }),
    prisma.customerPass.count({
      where: { program: { businessId: session.user.businessId }, rewardReady: true },
    }),
  ])

  // Sellos de los últimos 7 días por día
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const recentStamps = await prisma.stamp.findMany({
    where: {
      pass: { program: { businessId: session.user.businessId } },
      createdAt: { gte: sevenDaysAgo },
    },
    select: { createdAt: true },
  })

  return NextResponse.json({
    totalCustomers,
    totalStamps,
    totalRewards: totalRewards._sum.totalRewardsEarned || 0,
    pendingRewards,
    recentStamps: recentStamps.length,
  })
}
