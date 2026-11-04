import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateLoyaltyObject } from '@/lib/google-wallet'
import { pushPassUpdate } from '@/lib/apns'

export const runtime = 'nodejs'

// POST /api/redeem → el comerciante canjea el premio del cliente y resetea los sellos
// Body: { serialNumber: string }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { serialNumber } = await req.json()
  if (!serialNumber) {
    return NextResponse.json({ error: 'serialNumber requerido' }, { status: 400 })
  }

  const passRecord = await prisma.customerPass.findUnique({
    where: { serialNumber },
    include: { customer: true, program: { include: { business: true } } },
  })

  if (!passRecord) {
    return NextResponse.json({ error: 'Pase no encontrado' }, { status: 404 })
  }

  if (passRecord.program.businessId !== session.user.businessId) {
    return NextResponse.json({ error: 'Este pase no pertenece a tu negocio' }, { status: 403 })
  }

  if (!passRecord.rewardReady) {
    return NextResponse.json({ error: 'El cliente no tiene un premio pendiente' }, { status: 409 })
  }

  // Resetear sellos y marcar premio como canjeado
  const updatedPass = await prisma.customerPass.update({
    where: { id: passRecord.id },
    data: {
      currentStamps: 0,
      rewardReady: false,
      totalRewardsEarned: { increment: 1 },
      applePassUpdatedAt: new Date(),
    },
    include: { customer: true, program: { include: { business: true } } },
  })

  // Actualizar wallets
  if (updatedPass.googleObjectId) {
    updateLoyaltyObject(updatedPass as any).catch(console.error)
  }
  pushPassUpdate(serialNumber).catch(console.error)

  return NextResponse.json({
    success: true,
    message: `Premio canjeado para ${passRecord.customer.name}. Sellos reseteados a 0.`,
    totalRewardsEarned: updatedPass.totalRewardsEarned,
  })
}
