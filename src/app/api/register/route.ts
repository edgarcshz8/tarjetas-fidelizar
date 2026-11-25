import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { upsertLoyaltyClass, createLoyaltyObject, buildObjectId, getSaveToWalletUrl } from '@/lib/google-wallet'
import { generateUniquePassCode, generateUniqueReferralCode } from '@/lib/shortcode'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const schema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  referralCode: z.string().length(6).optional(),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? '127.0.0.1'
  const rl = checkRateLimit(`reg-cust:${ip}`, 20, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, { status: 429 })
  }

  try {
    const body = await req.json()
    const data = schema.parse(body)

    // Buscar el negocio por slug
    const business = await prisma.business.findUnique({
      where: { slug: data.slug },
      include: {
        programs: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    })

    if (!business) {
      return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })
    }

    const program = business.programs[0]
    if (!program) {
      return NextResponse.json({ error: 'No hay un programa activo configurado' }, { status: 404 })
    }

    // Crear o recuperar cliente. No actualizamos nombre/teléfono en upsert para
    // evitar que un registro en otro negocio sobrescriba los datos del cliente.
    const birthDate = data.birthDate ? new Date(data.birthDate) : undefined
    const customer = await prisma.customer.upsert({
      where: { email: data.email },
      update: {},
      create: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        birthDate,
      },
    })

    // Verificar si ya tiene un pase para este programa
    const existing = await prisma.customerPass.findFirst({
      where: { customerId: customer.id, programId: program.id },
      include: { customer: true, program: { include: { business: true } } },
    })

    let passRecord = existing

    // ─── Crear pase si no existe ────────────────────────────────────────────
    if (!passRecord) {
      const serialNumber = await generateUniquePassCode()
      const refCode      = await generateUniqueReferralCode()
      passRecord = await prisma.customerPass.create({
        data: {
          serialNumber,
          customerId:  customer.id,
          programId:   program.id,
          currentStamps: 0,
          referralCode: refCode,
        },
        include: { customer: true, program: { include: { business: true } } },
      })

      // Registrar relación de referido si se pasó un código válido
      if (data.referralCode) {
        const referrerPass = await prisma.customerPass.findFirst({
          where: { referralCode: data.referralCode, programId: program.id },
        })
        if (referrerPass && referrerPass.customerId !== customer.id) {
          await prisma.referral.upsert({
            where:  { referredPassId: passRecord.id },
            create: { referrerPassId: referrerPass.id, referredPassId: passRecord.id },
            update: {},
          })
        }
      }
    }

    // ─── Crear/recuperar Google Wallet object (nuevo pase o pase sin googleObjectId) ─
    if (!passRecord.googleObjectId) {
      try {
        const classId = await upsertLoyaltyClass(passRecord.program as any)

        if (!program.googleClassId) {
          await prisma.loyaltyProgram.update({
            where: { id: program.id },
            data: { googleClassId: classId },
          })
        }

        const googleObjectId = await createLoyaltyObject(passRecord as any)

        passRecord = await prisma.customerPass.update({
          where: { id: passRecord.id },
          data: { googleObjectId },
          include: { customer: true, program: { include: { business: true } } },
        })
      } catch (err) {
        console.error('Error creando Google Wallet object:', err)
      }
    }

    // ─── URLs de descarga ───────────────────────────────────────────────────
    const rawAppUrl = process.env.APP_URL || 'http://localhost:3000'
    const appUrl = /^https?:\/\//.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`
    const applePassUrl = `${appUrl}/api/passes/apple/${passRecord.serialNumber}/download?token=${passRecord.authToken}`

    // Usar googleObjectId guardado en BD; si falta (error de creación), derivar del serialNumber
    let googleWalletUrl = '#'
    try {
      const objectId = passRecord.googleObjectId ?? buildObjectId(passRecord.serialNumber)
      googleWalletUrl = getSaveToWalletUrl(objectId)
    } catch {
      // Google Wallet no configurado
    }

    return NextResponse.json({
      applePassUrl,
      googleWalletUrl,
      customerName: customer.name,
      programName: program.name,
      stampsRequired: program.stampsRequired,
      rewardDescription: program.rewardDescription,
      stampEmoji: program.stampEmoji ?? '⭐',
      referralLink: passRecord.referralCode
        ? `${appUrl}/${business.slug}?ref=${passRecord.referralCode}`
        : null,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: err.errors }, { status: 400 })
    }
    console.error('[POST /api/register]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
