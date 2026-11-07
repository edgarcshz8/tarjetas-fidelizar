import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { upsertLoyaltyClass, updateLoyaltyObject, pushGoogleWalletMessage } from '@/lib/google-wallet'
import { pushPassUpdate } from '@/lib/apns'

export const runtime = 'nodejs'

// GET → obtener programa activo del negocio
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const program = await prisma.loyaltyProgram.findFirst({
    where: { businessId: session.user.businessId, isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ program })
}

const updateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  stampsRequired: z.number().int().min(1).max(100),
  rewardDescription: z.string().min(1).max(200),
  stampIconUrl: z.string().optional(),
  stampEmoji: z.string().optional(),
  rewardIconUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  foregroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  labelColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

// POST → crear o actualizar programa
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const data = updateSchema.parse(body)

  if (data.id) {
    // Actualizar programa existente
    const existing = await prisma.loyaltyProgram.findFirst({
      where: { id: data.id, businessId: session.user.businessId },
    })
    if (!existing) return NextResponse.json({ error: 'Programa no encontrado' }, { status: 404 })

    const program = await prisma.loyaltyProgram.update({
      where: { id: data.id },
      data: { ...data, id: undefined },
    })

    // Propagar cambios a todos los pases existentes en background
    syncWalletPasses(program.id).catch(err =>
      console.error('[programs] syncWalletPasses error:', err)
    )

    return NextResponse.json({ program })
  }

  // Crear nuevo programa (no hay pases existentes que actualizar)
  const program = await prisma.loyaltyProgram.create({
    data: {
      businessId: session.user.businessId,
      name: data.name,
      description: data.description,
      stampsRequired: data.stampsRequired,
      rewardDescription: data.rewardDescription,
      stampIconUrl: data.stampIconUrl,
      rewardIconUrl: data.rewardIconUrl,
      logoUrl: data.logoUrl,
      backgroundColor: data.backgroundColor,
      foregroundColor: data.foregroundColor,
      labelColor: data.labelColor,
    },
  })

  return NextResponse.json({ program }, { status: 201 })
}

// Actualiza todos los pases activos del programa en Apple Wallet y Google Wallet.
// Se ejecuta en background (fire-and-forget) para no bloquear la respuesta al admin.
async function syncWalletPasses(programId: string): Promise<void> {
  const program = await prisma.loyaltyProgram.findUnique({
    where: { id: programId },
    include: { business: true },
  })
  if (!program) return

  // Google Wallet: actualizar la clase (colores, logo, nombre del programa)
  await upsertLoyaltyClass(program).catch(err =>
    console.error('[programs] upsertLoyaltyClass:', err)
  )

  const passes = await prisma.customerPass.findMany({
    where: { programId },
    include: { customer: true },
  })
  if (passes.length === 0) return

  // Marcar todos los pases como modificados para que Apple Wallet los re-descargue
  await prisma.customerPass.updateMany({
    where: { programId },
    data: { applePassUpdatedAt: new Date() },
  })

  for (const pass of passes) {
    const passData = { ...pass, program, customer: pass.customer }

    if (pass.googleObjectId) {
      await updateLoyaltyObject(passData as any).catch(err =>
        console.error(`[programs] updateLoyaltyObject serial=${pass.serialNumber}:`, err)
      )
      await pushGoogleWalletMessage(
        pass.googleObjectId,
        pass.currentStamps,
        program.stampsRequired,
        pass.rewardReady,
      ).catch(err =>
        console.error(`[programs] pushGoogleWalletMessage serial=${pass.serialNumber}:`, err)
      )
    }

    await pushPassUpdate(pass.serialNumber).catch(err =>
      console.error(`[programs] APNs push serial=${pass.serialNumber}:`, err)
    )
  }

  console.log(`[programs] syncWalletPasses done — ${passes.length} pase(s) actualizados`)
}
