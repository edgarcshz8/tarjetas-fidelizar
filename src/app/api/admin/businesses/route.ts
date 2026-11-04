import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const runtime = 'nodejs'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  logoUrl: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

// GET → obtener info del negocio
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
  })

  return NextResponse.json({ business })
}

// PATCH → actualizar info del negocio
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json()
  const data = updateSchema.parse(body)

  const business = await prisma.business.update({
    where: { id: session.user.businessId },
    data,
  })

  return NextResponse.json({ business })
}
