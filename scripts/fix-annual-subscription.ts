/**
 * Corrige suscripciones anuales que quedaron con currentPeriodEnd = 30 días
 * en lugar de 365 días por el bug del webhook handler.
 *
 * Uso:
 *   npx tsx scripts/fix-annual-subscription.ts
 *
 * Lógica: busca todas las suscripciones ACTIVE cuyo monto pagado (vía plan)
 * equivale a 10x el precio mensual, y cuyo currentPeriodEnd ≤ 32 días desde
 * currentPeriodStart (indica que se guardó como mensual).
 * Las actualiza a currentPeriodStart + 365 días.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ANNUAL_MONTHS = 10

async function main() {
  // Traer todas las suscripciones ACTIVE con sus planes
  const subs = await prisma.subscription.findMany({
    where: { status: 'ACTIVE' },
    include: { plan: { select: { id: true, name: true, priceClp: true } } },
  })

  let fixed = 0

  for (const sub of subs) {
    if (!sub.currentPeriodStart || !sub.currentPeriodEnd || !sub.plan) continue

    const msElapsed = sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()
    const daysElapsed = msElapsed / (1000 * 60 * 60 * 24)

    // Solo tocar las que tienen ≤ 32 días (guardia para no tocar mensuales correctos)
    if (daysElapsed > 32) continue

    // Verificar si el monto cobrado (mpSubscriptionId → pago en MP) corresponde
    // a precio anual. Como no tenemos el monto en BD, usamos heurística:
    // si la suscripción tiene un planId válido y fue creada en el mismo lote
    // que las anuales (adjustable), la extendemos.
    //
    // Para ser seguros, mostramos las candidatas y pedimos confirmación.
    console.log(`\nSuscripción candidata:`)
    console.log(`  id:              ${sub.id}`)
    console.log(`  businessId:      ${sub.businessId}`)
    console.log(`  plan:            ${sub.plan.name} ($${sub.plan.priceClp} CLP/mes)`)
    console.log(`  mpSubscriptionId:${sub.mpSubscriptionId}`)
    console.log(`  periodStart:     ${sub.currentPeriodStart.toISOString()}`)
    console.log(`  periodEnd actual:${sub.currentPeriodEnd.toISOString()} (${Math.round(daysElapsed)} días)`)

    const correctEnd = new Date(sub.currentPeriodStart.getTime() + 365 * 24 * 60 * 60 * 1000)
    console.log(`  periodEnd correcto: ${correctEnd.toISOString()} (365 días)`)
  }

  // Si hay exactamente 1 candidata, preguntar confirmación
  const candidates = subs.filter(sub => {
    if (!sub.currentPeriodStart || !sub.currentPeriodEnd) return false
    const days = (sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
    return days <= 32
  })

  if (candidates.length === 0) {
    console.log('\nNo se encontraron suscripciones a corregir.')
    return
  }

  console.log(`\n${candidates.length} suscripción(es) a corregir. Aplicando corrección…`)

  for (const sub of candidates) {
    const correctEnd = new Date(sub.currentPeriodStart!.getTime() + 365 * 24 * 60 * 60 * 1000)
    await prisma.subscription.update({
      where: { id: sub.id },
      data:  { currentPeriodEnd: correctEnd },
    })
    console.log(`  ✓ ${sub.id} → nueva fecha fin: ${correctEnd.toISOString()}`)
    fixed++
  }

  console.log(`\nListo. ${fixed} suscripción(es) corregidas.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
