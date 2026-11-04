import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateLoyaltyObject } from '@/lib/google-wallet'
import { pushPassUpdate } from '@/lib/apns'

export const runtime = 'nodejs'

// POST /api/stamp → agrega un sello a un pase
// Body: { serialNumber: string }
// Auth: sesión de merchant (admin panel)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { serialNumber } = await req.json()
  if (!serialNumber) {
    return NextResponse.json({ error: 'serialNumber requerido' }, { status: 400 })
  }

  // Verificar que el pase pertenece al negocio del usuario autenticado
  const passRecord = await prisma.customerPass.findUnique({
    where: { serialNumber },
    include: {
      customer: true,
      program: { include: { business: true } },
    },
  })

  if (!passRecord) {
    return NextResponse.json({ error: 'Pase no encontrado' }, { status: 404 })
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

  const newStamps = passRecord.currentStamps + 1
  const rewardReady = newStamps >= passRecord.program.stampsRequired

  // Actualizar el pase
  const updatedPass = await prisma.customerPass.update({
    where: { id: passRecord.id },
    data: {
      currentStamps: rewardReady ? passRecord.currentStamps + 1 : newStamps,
      rewardReady,
      applePassUpdatedAt: new Date(),
    },
    include: { customer: true, program: { include: { business: true } } },
  })

  // Registrar el sello en el historial
  await prisma.stamp.create({
    data: {
      passId: passRecord.id,
      addedById: user.id,
    },
  })

  // Actualizar Google Wallet de forma asíncrona (no bloquear la respuesta)
  if (updatedPass.googleObjectId) {
    updateLoyaltyObject(updatedPass as any).catch(err =>
      console.error('[stamp] Error actualizando Google Wallet:', err)
    )
  }

  // Enviar push notification a dispositivos Apple
  pushPassUpdate(serialNumber).catch(err =>
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
