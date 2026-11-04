import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import SettingsForm from '@/components/SettingsForm'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const [business, program] = await Promise.all([
    prisma.business.findUnique({ where: { id: session.user.businessId } }),
    prisma.loyaltyProgram.findFirst({
      where: { businessId: session.user.businessId, isActive: true },
    }),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500">Personaliza tu programa de fidelización</p>
      </div>

      <SettingsForm business={business} program={program} />
    </div>
  )
}
