import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { upsertLoyaltyClass, createLoyaltyObject, buildObjectId, getSaveToWalletUrl } from '@/lib/google-wallet'
import { generateUniquePassCode } from '@/lib/shortcode'

export const runtime = 'nodejs'

const schema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
})

export async function POST(req: NextRequest) {
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

    // Crear o recuperar cliente
    const birthDate = data.birthDate ? new Date(data.birthDate) : undefined
    const customer = await prisma.customer.upsert({
      where: { email: data.email },
      update: {
        name: data.name,
        phone: data.phone,
        ...(birthDate ? { birthDate } : {}),
      },
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
      passRecord = await prisma.customerPass.create({
        data: {
          serialNumber,
          customerId: customer.id,
          programId: program.id,
          currentStamps: 0,
        },
        include: { customer: true, program: { include: { business: true } } },
      })

      // Crear Google Wallet object
      try {
        // Asegurar que la clase existe en Google
        const classId = await upsertLoyaltyClass(passRecord.program as any)

        // Actualizar classId en el programa si aún no está guardado
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
        // Continuar sin Google Wallet si hay error de configuración
      }
    }

    // ─── URLs de descarga ───────────────────────────────────────────────────
    const rawAppUrl = process.env.APP_URL || 'http://localhost:3000'
    const appUrl = /^https?:\/\//.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`
    const applePassUrl = `${appUrl}/api/passes/apple/${passRecord.serialNumber}/download`

    let googleWalletUrl = '#'
    if (passRecord.googleObjectId) {
      try {
        googleWalletUrl = getSaveToWalletUrl(passRecord.googleObjectId)
      } catch {
        // Google Wallet no configurado
      }
    }

    return NextResponse.json({
      applePassUrl,
      googleWalletUrl,
      customerName: customer.name,
      programName: program.name,
      stampsRequired: program.stampsRequired,
      rewardDescription: program.rewardDescription,
      stampEmoji: program.stampEmoji ?? '⭐',
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: err.errors }, { status: 400 })
    }
    console.error('[POST /api/register]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
