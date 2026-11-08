import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

export const runtime = 'nodejs'

// ─── GET: lista todos los negocios (sin el negocio plataforma) ────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const businesses = await prisma.business.findMany({
    where: { slug: { not: 'platform-system' } },
    include: {
      users: {
        where: { role: 'OWNER' },
        select: { email: true, name: true },
        take: 1,
      },
      programs: {
        where: { isActive: true },
        select: { name: true, stampsRequired: true, stampEmoji: true },
        take: 1,
      },
      _count: {
        select: { users: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Contar pases totales por negocio en una sola query
  const passesPerBusiness = await prisma.customerPass.groupBy({
    by: ['programId'],
    _count: { id: true },
  })

  // Query directa de programas con sus IDs (para mapear programId → businessId)
  const programs = await prisma.loyaltyProgram.findMany({
    where: { isActive: true, business: { slug: { not: 'platform-system' } } },
    select: { id: true, businessId: true },
  })
  const programToBusinessId: Record<string, string> = {}
  for (const p of programs) programToBusinessId[p.id] = p.businessId

  const passCountByBusiness: Record<string, number> = {}
  for (const g of passesPerBusiness) {
    const bizId = programToBusinessId[g.programId]
    if (bizId) passCountByBusiness[bizId] = (passCountByBusiness[bizId] ?? 0) + g._count.id
  }

  const result = businesses.map(b => ({
    id:           b.id,
    name:         b.name,
    slug:         b.slug,
    createdAt:    b.createdAt,
    owner:        b.users[0] ?? null,
    program:      b.programs[0] ?? null,
    employeeCount: b._count.users,
    customerCount: passCountByBusiness[b.id] ?? 0,
  }))

  const totalCustomers = Object.values(passCountByBusiness).reduce((a, b) => a + b, 0)

  return NextResponse.json({
    businesses: result,
    stats: {
      totalBusinesses: result.length,
      totalCustomers,
    },
  })
}

// ─── POST: crear nuevo negocio + propietario + programa por defecto ──────────
const createSchema = z.object({
  businessName: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Solo letras minúsculas, números y guiones'),
  ownerName:  z.string().min(2).max(80),
  email:      z.string().email(),
  password:   z.string().min(8),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message || 'Datos inválidos'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { businessName, slug, ownerName, email, password } = parsed.data

  const [existingSlug, existingEmail] = await Promise.all([
    prisma.business.findUnique({ where: { slug } }),
    prisma.user.findUnique({ where: { email } }),
  ])
  if (existingSlug)  return NextResponse.json({ error: 'Ese identificador ya está en uso.' }, { status: 409 })
  if (existingEmail) return NextResponse.json({ error: 'Ya existe una cuenta con ese email.' }, { status: 409 })

  const hashedPassword = await bcrypt.hash(password, 12)

  await prisma.$transaction(async tx => {
    const business = await tx.business.create({
      data: {
        slug,
        name:          businessName,
        primaryColor:  '#1a1a2e',
        secondaryColor:'#ffffff',
        accentColor:   '#e94560',
      },
    })

    await tx.user.create({
      data: {
        businessId: business.id,
        email,
        password:   hashedPassword,
        name:       ownerName,
        role:       'OWNER',
      },
    })

    await tx.loyaltyProgram.create({
      data: {
        businessId:        business.id,
        name:              `Tarjeta de Sellos – ${businessName}`,
        description:       `Programa de fidelización de ${businessName}`,
        stampsRequired:    10,
        rewardDescription: 'Premio por completar la tarjeta',
        backgroundColor:   '#1a1a2e',
        foregroundColor:   '#ffffff',
        labelColor:        '#cccccc',
        isActive:          true,
      },
    })
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
