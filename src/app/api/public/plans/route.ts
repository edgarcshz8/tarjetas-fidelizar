import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/public/plans
// Endpoint público — devuelve los planes activos disponibles para suscripción.
export async function GET() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    select: { id: true, name: true, priceClp: true, intervalDays: true },
    orderBy: { priceClp: 'asc' },
  })

  return NextResponse.json(plans)
}
