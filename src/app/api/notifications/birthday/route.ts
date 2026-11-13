import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pushPassUpdate } from '@/lib/apns'
import { pushBirthdayNotification } from '@/lib/google-wallet'
import { isBirthdayToday, todayInTimezone, BIRTHDAY_TIMEZONE, renderBirthdayMessage, DEFAULT_BIRTHDAY_TITLE, DEFAULT_BIRTHDAY_MESSAGE } from '@/lib/birthday'

export const runtime = 'nodejs'

// POST /api/notifications/birthday
// Llama este endpoint diariamente vía cron job.
// Requiere header: Authorization: Bearer <CRON_SECRET>
// Pruebas: POST /api/notifications/birthday?force=1 notifica aunque ya se haya
// notificado hoy, y agrega la hora al mensaje para que el pase cambie y iOS avise.
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

  const force = req.nextUrl.searchParams.get('force') === '1'
  const nowTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: BIRTHDAY_TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date())
  // Normal: "YYYY-MM-DD". Prueba: "YYYY-MM-DDTHH:MM:SS" (passkit agrega la hora al mensaje).
  const notifiedValue = force ? `${today.iso}T${nowTime}` : today.iso

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
        where: force
          ? { id: pass.id }
          : {
              id: pass.id,
              OR: [
                { birthdayNotifiedOn: null },
                { NOT: { birthdayNotifiedOn: { startsWith: today.iso } } },
              ],
            },
        data: { applePassUpdatedAt: new Date(), birthdayNotifiedOn: notifiedValue },
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
        const firstName = customer.name.trim().split(/\s+/)[0] || customer.name
        const vars = { nombre: firstName, negocio: businessName, premio: pass.program.rewardDescription }
        const googleHeader = renderBirthdayMessage(pass.program.birthdayTitle || DEFAULT_BIRTHDAY_TITLE, vars)
        const googleBody   = renderBirthdayMessage(pass.program.birthdayMessage || DEFAULT_BIRTHDAY_MESSAGE, vars)
        await pushBirthdayNotification(
          pass.googleObjectId,
          googleHeader,
          googleBody,
        ).catch(err => {
          errors.push(`Google objectId=${pass.googleObjectId}: ${err?.message}`)
        })
        googleCount++
      }
    }
  }

  console.log(
    `[birthday] ${today.iso}${force ? ' (force)' : ''} — ` +
    `${birthdayCustomers.length} cumpleaños, Apple: ${appleCount}, Google: ${googleCount}, ya notificados hoy: ${skipped}`,
  )

  return NextResponse.json({
    ok: true,
    date: today.iso,
    force,
    birthdayCustomers: birthdayCustomers.length,
    appleNotifications: appleCount,
    googleNotifications: googleCount,
    alreadyNotifiedToday: skipped,
    ...(errors.length ? { errors } : {}),
  })
}
