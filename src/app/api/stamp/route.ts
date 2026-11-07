import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateLoyaltyObject } from '@/lib/google-wallet'
import { pushPassUpdate } from '@/lib/apns'

export const runtime = 'nodejs'

// POST /api/stamp → agrega un sello a un pase
// Body: { serialNumber: string } — desde escáner QR (serial completo)
//       { email: string }        — desde ingreso manual (email del cliente)
// Auth: sesión de merchant (admin panel)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const { serialNumber, email } = body as { serialNumber?: string; email?: string }

  if (!serialNumber && !email) {
    return NextResponse.json({ error: 'Proporciona serialNumber o email' }, { status: 400 })
  }

  // ─── Buscar el pase ────────────────────────────────────────────────────────
  const include = { customer: true, program: { include: { business: true } } } as const

  const passRecord = serialNumber
    ? await prisma.customerPass.findFirst({ where: { serialNumber }, include })
    : await prisma.customerPass.findFirst({
        where: {
          customer: { email: (email as string).toLowerCase().trim() },
          program:  { businessId: session.user.businessId },
        },
        include,
      })

  if (!passRecord) {
    const hint = email
      ? `No se encontró ningún cliente registrado con el email "${email}" en tu negocio.`
      : 'Pase no encontrado.'
    return NextResponse.json({ error: hint }, { status: 404 })
  }

  if (passRecord.program.businessId !== session.user.businessId) {
    return NextResponse.json({ error: 'Este pase no pertenece a tu negocio' }, { status: 403 })
  }

  if (passRecord.rewardReady) {
    return NextResponse.json(
      { error: 'El cliente tiene un premio pendiente de canjear antes de sumar más sellos' },
      { status: 409 }
    )
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  // Cooldown: evitar doble-sello si el mismo QR se escanea en < 10 segundos
  const lastStamp = await prisma.stamp.findFirst({
    where: { passId: passRecord.id },
    orderBy: { createdAt: 'desc' },
  })
  if (lastStamp && Date.now() - lastStamp.createdAt.getTime() < 10_000) {
    return NextResponse.json(
      { error: 'Este pase ya fue sellado hace menos de 10 segundos.' },
      { status: 429 }
    )
  }

  // Incremento atómico
  const updatedPass = await prisma.$transaction(async tx => {
    const pass = await tx.customerPass.update({
      where: { id: passRecord!.id },
      data: {
        currentStamps: { increment: 1 },
        applePassUpdatedAt: new Date(),
      },
      include: { customer: true, program: { include: { business: true } } },
    })

    const shouldReward = pass.currentStamps >= pass.program.stampsRequired && !pass.rewardReady
    if (shouldReward) {
      return tx.customerPass.update({
        where: { id: passRecord!.id },
        data: { rewardReady: true },
        include: { customer: true, program: { include: { business: true } } },
      })
    }
    return pass
  })

  const rewardReady = updatedPass.rewardReady

  await prisma.stamp.create({
    data: { passId: passRecord.id, addedById: user.id },
  })

  if (updatedPass.googleObjectId) {
    updateLoyaltyObject(updatedPass as any).catch(err =>
      console.error('[stamp] Error actualizando Google Wallet:', err)
    )
  }

  pushPassUpdate(passRecord.serialNumber).catch(err =>
    console.error('[stamp] Error enviando APNS push:', err)
  )

  return NextResponse.json({
    success: true,
    currentStamps: updatedPass.currentStamps,
    stampsRequired: passRecord.program.stampsRequired,
    rewardReady,
    customerName: passRecord.customer.name,
    message: rewardReady
      ? `¡${passRecord.customer.name} ha completado sus sellos! Premio: ${passRecord.program.rewardDescription}`
      : `Sello agregado. ${updatedPass.currentStamps}/${passRecord.program.stampsRequired} sellos.`,
  })
}
