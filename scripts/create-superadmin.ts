import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const SUPERADMIN_EMAIL    = 'edgar.cshz8@gmail.com'
const SUPERADMIN_NAME     = 'Edgar Campos'
const SUPERADMIN_PASSWORD = 'Fidelizar2024!'

async function main() {
  const hashedPassword = await bcrypt.hash(SUPERADMIN_PASSWORD, 12)

  // Negocio plataforma — sólo existe para satisfacer el FK de User.businessId
  const platform = await prisma.business.upsert({
    where: { slug: 'platform-system' },
    update: {},
    create: {
      slug:          'platform-system',
      name:          'Platform',
      primaryColor:  '#0f172a',
      secondaryColor:'#ffffff',
      accentColor:   '#6366f1',
    },
  })

  const user = await prisma.user.upsert({
    where: { email: SUPERADMIN_EMAIL },
    update: { role: 'SUPERADMIN', password: hashedPassword },
    create: {
      businessId: platform.id,
      email:      SUPERADMIN_EMAIL,
      password:   hashedPassword,
      name:       SUPERADMIN_NAME,
      role:       'SUPERADMIN',
    },
  })

  console.log('\n✅ Super admin creado / actualizado:')
  console.log(`   Email:      ${user.email}`)
  console.log(`   Contraseña: ${SUPERADMIN_PASSWORD}`)
  console.log(`   URL:        /admin/login\n`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
