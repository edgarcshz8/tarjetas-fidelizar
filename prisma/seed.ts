import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 12)

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

  const user = await prisma.user.upsert({
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

  console.log('Seed completado:')
  console.log(`  Business: ${business.name} (slug: ${business.slug})`)
  console.log(`  Usuario admin: ${user.email} / contraseña: admin123`)
  console.log(`  URL de registro: http://localhost:3000/${business.slug}`)
  console.log(`  Panel admin: http://localhost:3000/admin/login`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
