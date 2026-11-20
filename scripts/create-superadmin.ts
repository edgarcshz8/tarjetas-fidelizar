import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Fallbacks for email/name are acceptable (non-secret). Never fallback for password.
const SUPERADMIN_EMAIL    = process.env.SUPERADMIN_EMAIL ?? 'edgar.cshz8@gmail.com'
const SUPERADMIN_NAME     = process.env.SUPERADMIN_NAME  ?? 'Edgar Campos'
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD   // undefined = not set

async function main() {
  // Platform business — only exists to satisfy the User.businessId FK
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

  const existing = await prisma.user.findUnique({ where: { email: SUPERADMIN_EMAIL } })

  if (!SUPERADMIN_PASSWORD) {
    if (existing) {
      // Ensure role is SUPERADMIN but never touch the password
      await prisma.user.update({
        where: { email: SUPERADMIN_EMAIL },
        data: { role: 'SUPERADMIN' },
      })
      console.log('[superadmin] exists, password unchanged')
    } else {
      console.warn('[superadmin] WARNING: SUPERADMIN_PASSWORD not set and user does not exist — skipping creation')
    }
    return
  }

  const hashedPassword = await bcrypt.hash(SUPERADMIN_PASSWORD, 12)

  await prisma.user.upsert({
    where: { email: SUPERADMIN_EMAIL },
    // Never update password on restart — only ensure role
    update: { role: 'SUPERADMIN' },
    create: {
      businessId: platform.id,
      email:      SUPERADMIN_EMAIL,
      password:   hashedPassword,
      name:       SUPERADMIN_NAME,
      role:       'SUPERADMIN',
    },
  })

  console.log('[superadmin] upsert OK')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
