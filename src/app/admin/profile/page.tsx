import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import PasswordChangeCard from '@/components/PasswordChangeCard'

export const metadata = { title: 'Perfil — MisStamps' }

export default async function ProfilePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/admin/login')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Perfil</h1>
        <p className="text-gray-500">{session.user.businessName}</p>
      </div>
      <PasswordChangeCard />
    </div>
  )
}
