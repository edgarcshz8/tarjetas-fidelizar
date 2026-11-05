import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

export const runtime = 'nodejs'

const schema = z.object({
  businessName: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Solo letras minúsculas, números y guiones'),
  ownerName: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message || 'Datos inválidos'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { businessName, slug, ownerName, email, password } = parsed.data

  // Verificar unicidad de slug y email en paralelo
  const [existingSlug, existingEmail] = await Promise.all([
    prisma.business.findUnique({ where: { slug } }),
    prisma.user.findUnique({ where: { email } }),
  ])

  if (existingSlug) {
    return NextResponse.json({ error: 'Ese identificador ya está en uso. Elige otro.' }, { status: 409 })
  }
  if (existingEmail) {
    return NextResponse.json({ error: 'Ya existe una cuenta con ese email.' }, { status: 409 })
  }

  const hashedPassword = await bcrypt.hash(password, 12)

  // Crear business + user + programa por defecto en una transacción
  await prisma.$transaction(async tx => {
    const business = await tx.business.create({
      data: {
        slug,
        name: businessName,
        primaryColor: '#1a1a2e',
        secondaryColor: '#ffffff',
        accentColor: '#e94560',
      },
    })

    await tx.user.create({
      data: {
        businessId: business.id,
        email,
        password: hashedPassword,
        name: ownerName,
        role: 'OWNER',
      },
    })

    await tx.loyaltyProgram.create({
      data: {
        businessId: business.id,
        name: `Tarjeta de Sellos – ${businessName}`,
        description: `Programa de fidelización de ${businessName}`,
        stampsRequired: 10,
        rewardDescription: 'Premio por completar la tarjeta',
        backgroundColor: '#1a1a2e',
        foregroundColor: '#ffffff',
        labelColor: '#cccccc',
        isActive: true,
      },
    })
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
