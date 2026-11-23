import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkActiveSubscription } from '@/lib/subscriptionGuard'
import { updateLoyaltyObject, pushGoogleWalletMessage } from '@/lib/google-wallet'
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

  const subCheck = await checkActiveSubscription(session.user.businessId)
  if (!subCheck.allowed) {
    return NextResponse.json({ error: subCheck.error }, { status: subCheck.status })
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

  // TEMP: límite de 1 sello por día desactivado
  // const now = new Date()
  // const p = new Intl.DateTimeFormat('en-US', {
  //   timeZone: 'America/Santiago',
  //   year: 'numeric', month: '2-digit', day: '2-digit',
  //   hour: '2-digit', minute: '2-digit', second: '2-digit',
  //   hour12: false,
  // }).formatToParts(now).reduce<Record<string, string>>((r, x) => {
  //   if (x.type !== 'literal') r[x.type] = x.value
  //   return r
  // }, {})
  // const offsetMs = now.getTime() - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  // const todayStart = new Date(Date.UTC(+p.year, +p.month - 1, +p.day) + offsetMs)
  // const stampToday = await prisma.stamp.findFirst({
  //   where: { passId: passRecord.id, createdAt: { gte: todayStart } },
  // })
  // if (stampToday) {
  //   return NextResponse.json(
  //     { error: 'Esta tarjeta ya recibió su sello de hoy. Vuelve mañana.' },
  //     { status: 429 }
  //   )
  // }

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

  // ─── Referral bonus: se activa una sola vez en el primer sello del referido ──
  const stampCount = await prisma.stamp.count({ where: { passId: passRecord.id } })
  if (stampCount === 1) {
    const referral = await prisma.referral.findUnique({
      where: { referredPassId: passRecord.id },
      include: { referrerPass: { include: { customer: true, program: true } } },
    })
    const bonusReferrer = passRecord.program.referralBonusReferrer ?? 0
    const bonusReferred = passRecord.program.referralBonusReferred ?? 0
    if (referral && !referral.bonusGranted && (bonusReferrer > 0 || bonusReferred > 0)) {
      await prisma.$transaction([
        ...(bonusReferred > 0 ? [prisma.customerPass.update({
          where: { id: referral.referredPassId },
          data:  { currentStamps: { increment: bonusReferred }, applePassUpdatedAt: new Date() },
        })] : []),
        ...(bonusReferrer > 0 ? [prisma.customerPass.update({
          where: { id: referral.referrerPassId },
          data:  { currentStamps: { increment: bonusReferrer }, applePassUpdatedAt: new Date() },
        })] : []),
        prisma.referral.update({
          where: { id: referral.id },
          data:  { bonusGranted: true },
        }),
      ])
      pushPassUpdate(referral.referrerPass.serialNumber).catch(err =>
        console.error('[stamp] referral bonus APNS push (referrer):', err)
      )
      if (referral.referrerPass.googleObjectId) {
        const updatedReferrer = await prisma.customerPass.findUnique({
          where:   { id: referral.referrerPassId },
          include: { customer: true, program: { include: { business: true } } },
        })
        if (updatedReferrer) {
          updateLoyaltyObject(updatedReferrer as any).catch(err =>
            console.error('[stamp] referral bonus Google push (referrer):', err)
          )
        }
      }
    }
  }

  if (updatedPass.googleObjectId) {
    updateLoyaltyObject(updatedPass as any)
      .then(() =>
        pushGoogleWalletMessage(
          updatedPass.googleObjectId!,
          updatedPass.currentStamps,
          updatedPass.program.stampsRequired,
          rewardReady,
          updatedPass.program.stampEmoji ?? '⭐',
        )
      )
      .catch(err => console.error('[stamp] Error Google Wallet push:', err))
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
