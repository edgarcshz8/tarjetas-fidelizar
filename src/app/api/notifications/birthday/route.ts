import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pushPassUpdate } from '@/lib/apns'
import { pushBirthdayNotification } from '@/lib/google-wallet'

export const runtime = 'nodejs'

// POST /api/notifications/birthday
// Llama este endpoint diariamente vía cron job.
// Requiere header: Authorization: Bearer <CRON_SECRET>
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const today = new Date()
  const todayMonth = today.getUTCMonth() + 1 // 1-12
  const todayDay   = today.getUTCDate()       // 1-31

  // Cargar todos los clientes con birthDate y sus pases activos
  const customers = await prisma.customer.findMany({
    where: { birthDate: { not: null } },
    include: {
      passes: {
        include: {
          program: { include: { business: true } },
        },
      },
    },
  })

  // Filtrar por mes+día en JS (compatible SQLite y PostgreSQL)
  const birthdayCustomers = customers.filter(c => {
    if (!c.birthDate) return false
    const bd = new Date(c.birthDate)
    return bd.getUTCMonth() + 1 === todayMonth && bd.getUTCDate() === todayDay
  })

  let appleCount  = 0
  let googleCount = 0
  const errors: string[] = []

  for (const customer of birthdayCustomers) {
    for (const pass of customer.passes) {
      const businessName = pass.program.business.name

      // Apple: APNs push vacío → iOS recarga el pase (actualiza relevantDate al próximo año)
      await pushPassUpdate(pass.serialNumber).catch(err => {
        errors.push(`Apple serial=${pass.serialNumber}: ${err?.message}`)
      })
      appleCount++

      // Google: mensaje de cumpleaños en el pase
      if (pass.googleObjectId) {
        await pushBirthdayNotification(
          pass.googleObjectId,
          customer.name,
          businessName,
        ).catch(err => {
          errors.push(`Google objectId=${pass.googleObjectId}: ${err?.message}`)
        })
        googleCount++
      }
    }
  }

  console.log(
    `[birthday] ${today.toISOString().slice(0, 10)} — ` +
    `${birthdayCustomers.length} cumpleaños, Apple: ${appleCount}, Google: ${googleCount}`,
  )

  return NextResponse.json({
    ok: true,
    date: today.toISOString().slice(0, 10),
    birthdayCustomers: birthdayCustomers.length,
    appleNotifications: appleCount,
    googleNotifications: googleCount,
    ...(errors.length ? { errors } : {}),
  })
}
