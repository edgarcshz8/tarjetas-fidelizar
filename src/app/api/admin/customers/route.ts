import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const search = req.nextUrl.searchParams.get('search') || ''
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1')
  const pageSize = 20

  // SQLite no soporta mode:'insensitive', usar contains sin mode
  const whereCustomer = search
    ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
    : undefined

  const [passes, total] = await Promise.all([
    prisma.customerPass.findMany({
      where: {
        program: { businessId: session.user.businessId },
        customer: whereCustomer,
      },
      include: {
        customer: true,
        program: { select: { name: true, stampsRequired: true } },
        _count: { select: { stamps: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customerPass.count({
      where: {
        program: { businessId: session.user.businessId },
        customer: whereCustomer,
      },
    }),
  ])

  return NextResponse.json({ passes, total, page, pageSize })
}
