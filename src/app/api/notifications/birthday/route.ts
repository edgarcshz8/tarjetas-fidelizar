import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pushPassUpdate } from '@/lib/apns'
import { pushBirthdayNotification } from '@/lib/google-wallet'
import { isBirthdayToday, todayInTimezone } from '@/lib/birthday'

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

  // "Hoy" en hora de Chile (el servidor corre en UTC)
  const today = todayInTimezone()

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
  const birthdayCustomers = customers.filter(c => isBirthdayToday(c.birthDate))

  let appleCount  = 0
  let googleCount = 0
  let skipped     = 0
  const errors: string[] = []

  for (const customer of birthdayCustomers) {
    for (const pass of customer.passes) {
      const businessName = pass.program.business.name

      // Idempotencia: solo una notificación por pase por día. Si el cron corre varias
      // veces, re-marcar el pase sin que su contenido cambie provoca que iOS reporte
      // "Server requested update … but the pass was unchanged" e
      // "ignored the 'if-modified-since' header", y Apple puede limitar los pushes.
      // updateMany con condición = "claim" atómico (seguro ante ejecuciones simultáneas).
      // Apple: además marcamos el pase como actualizado. Sin esto, cuando el iPhone
      // recibe el push y consulta /registrations?passesUpdatedSince=..., el servidor
      // responde 204 ("spurious push") y el iPhone no descarga el pase nuevo.
      // El pase regenerado incluye el mensaje de cumpleaños con changeMessage,
      // que es lo que muestra la notificación en la pantalla de bloqueo.
      const claim = await prisma.customerPass.updateMany({
        where: {
          id: pass.id,
          OR: [{ birthdayNotifiedOn: null }, { birthdayNotifiedOn: { not: today.iso } }],
        },
        data: { applePassUpdatedAt: new Date(), birthdayNotifiedOn: today.iso },
      })
      if (claim.count === 0) {
        skipped++
        continue
      }
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
    `[birthday] ${today.iso} — ` +
    `${birthdayCustomers.length} cumpleaños, Apple: ${appleCount}, Google: ${googleCount}, ya notificados hoy: ${skipped}`,
  )

  return NextResponse.json({
    ok: true,
    date: today.iso,
    birthdayCustomers: birthdayCustomers.length,
    appleNotifications: appleCount,
    googleNotifications: googleCount,
    alreadyNotifiedToday: skipped,
    ...(errors.length ? { errors } : {}),
  })
}
