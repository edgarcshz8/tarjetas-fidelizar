/**
 * Seed the subscription plans.
 * Run with: npx tsx scripts/seed-plans.ts
 * Requires DATABASE_URL pointing to production PostgreSQL.
 */
import { PrismaClient, PlanInterval } from '@prisma/client'

const prisma = new PrismaClient()

const PLANS: Array<{
  name: string
  description: string
  price: number
  intervalDays: number
  interval: PlanInterval
  features: string[]
}> = [
  {
    name: 'Básico',
    description: 'Todo lo esencial para empezar tu programa de fidelización',
    price: 9990,
    intervalDays: 30,
    interval: 'MONTHLY',
    features: [
      'Tarjeta de fidelización en Apple Wallet y Google Wallet',
      'Escáner QR para agregar sellos',
      'Clientes ilimitados',
      'Dashboard y estadísticas',
      'Personalización de colores, emoji y diseño',
      'Soporte por email',
    ],
  },
  {
    name: 'Básico',
    description: 'Todo lo esencial para empezar tu programa de fidelización',
    price: 99900,
    intervalDays: 365,
    interval: 'ANNUAL',
    features: [
      'Tarjeta de fidelización en Apple Wallet y Google Wallet',
      'Escáner QR para agregar sellos',
      'Clientes ilimitados',
      'Dashboard y estadísticas',
      'Personalización de colores, emoji y diseño',
      'Soporte por email',
    ],
  },
  {
    name: 'Pro',
    description: 'Fidelización completa con referidos, cumpleaños y geofencing',
    price: 19990,
    intervalDays: 30,
    interval: 'MONTHLY',
    features: [
      'Todo lo del plan Básico',
      'Sistema de referidos (QR + sellos bonus configurables)',
      'Notificaciones de cumpleaños personalizadas',
      'Notificaciones de proximidad (geofencing)',
      'Soporte prioritario',
    ],
  },
  {
    name: 'Pro',
    description: 'Fidelización completa con referidos, cumpleaños y geofencing',
    price: 199900,
    intervalDays: 365,
    interval: 'ANNUAL',
    features: [
      'Todo lo del plan Básico',
      'Sistema de referidos (QR + sellos bonus configurables)',
      'Notificaciones de cumpleaños personalizadas',
      'Notificaciones de proximidad (geofencing)',
      'Soporte prioritario',
    ],
  },
  {
    name: 'Empresarial',
    description: 'Máximo alcance con marketing, reportes y comunicación masiva',
    price: 60000,
    intervalDays: 30,
    interval: 'MONTHLY',
    features: [
      'Todo lo del plan Pro',
      'Reseñas en Google',
      'Promociones ilimitadas',
      'Reportes',
      'Campañas de marketing',
      '5.000 emails/mes · Push ilimitados',
    ],
  },
  {
    name: 'Empresarial',
    description: 'Máximo alcance con marketing, reportes y comunicación masiva',
    price: 600000,
    intervalDays: 365,
    interval: 'ANNUAL',
    features: [
      'Todo lo del plan Pro',
      'Reseñas en Google',
      'Promociones ilimitadas',
      'Reportes',
      'Campañas de marketing',
      '5.000 emails/mes · Push ilimitados',
    ],
  },
]

async function main() {
  console.log('Seeding subscription plans…')

  for (const plan of PLANS) {
    const existing = await prisma.plan.findFirst({
      where: { name: plan.name, interval: plan.interval },
    })

    if (existing) {
      await prisma.plan.update({
        where: { id: existing.id },
        data: {
          description:  plan.description,
          price:        plan.price,
          intervalDays: plan.intervalDays,
          features:     plan.features,
          isActive:     true,
        },
      })
      console.log(`  Updated: ${plan.name} ${plan.interval} → $${plan.price.toLocaleString('es-CL')}`)
    } else {
      await prisma.plan.create({
        data: {
          name:         plan.name,
          description:  plan.description,
          price:        plan.price,
          intervalDays: plan.intervalDays,
          interval:     plan.interval,
          features:     plan.features,
          isActive:     true,
        },
      })
      console.log(`  Created: ${plan.name} ${plan.interval} → $${plan.price.toLocaleString('es-CL')}`)
    }
  }

  console.log('Done.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
