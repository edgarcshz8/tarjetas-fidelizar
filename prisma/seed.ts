import { PrismaClient } from '@prisma/client' 
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  // ─── Demo (non-production only, requires SEED_DEMO=true) ─────────────────
  // Never runs in production. Set SEED_DEMO=true in .env to seed demo data locally.
  if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO === 'true') {
    const demoPassword = process.env.DEMO_ADMIN_PASSWORD ?? randomBytes(16).toString('hex')
    if (!process.env.DEMO_ADMIN_PASSWORD) {
      console.log(`[seed] Generated demo password: ${demoPassword}  ← set DEMO_ADMIN_PASSWORD to fix it`)
    }
    const hashedPassword = await bcrypt.hash(demoPassword, 12)

    const business = await prisma.business.upsert({
      where: { slug: 'demo-cafe' },
      update: {},
      create: {
        slug: 'demo-cafe',
        name: 'Demo Café',
        primaryColor: '#2d1b69',
        secondaryColor: '#ffffff',
        accentColor: '#ff6b35',
      },
    })

    await prisma.user.upsert({
      where: { email: 'admin@democafe.com' },
      update: {},
      create: {
        businessId: business.id,
        email: 'admin@democafe.com',
        password: hashedPassword,
        name: 'Admin Demo',
        role: 'OWNER',
      },
    })

    await prisma.loyaltyProgram.upsert({
      where: { id: 'demo-program-id' },
      update: {},
      create: {
        id: 'demo-program-id',
        businessId: business.id,
        name: 'Tarjeta de Sellos Demo Café',
        description: '¡Colecciona sellos y gana un café gratis!',
        stampsRequired: 10,
        rewardDescription: '1 café de tu elección completamente gratis',
        backgroundColor: '#2d1b69',
        foregroundColor: '#ffffff',
        labelColor: '#ccbbff',
        isActive: true,
      },
    })

    console.log(`[seed] Demo: business=demo-cafe user=admin@democafe.com`)
  }

  // ─── Subscription plans (always) ─────────────────────────────────────────
  await prisma.plan.upsert({
    where: { id: 'plan-basico' },
    update: {},
    create: {
      id: 'plan-basico',
      name: 'Plan Básico',
      description: 'Para negocios que están empezando.',
      price: 9990,
      intervalDays: 30,
      interval: 'MONTHLY',
      features: ['Apple Wallet', 'Google Wallet', '1 programa de fidelización', 'Clientes ilimitados'],
      isActive: true,
    },
  })

  await prisma.plan.upsert({
    where: { id: 'plan-pro' },
    update: {},
    create: {
      id: 'plan-pro',
      name: 'Plan Pro',
      description: 'Para negocios en crecimiento.',
      price: 29990,
      intervalDays: 30,
      interval: 'MONTHLY',
      features: ['Apple Wallet', 'Google Wallet', 'Programas ilimitados', 'Clientes ilimitados', 'Push notifications', 'Soporte prioritario'],
      isActive: true,
    },
  })

  console.log('[seed] Plans upserted OK')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
