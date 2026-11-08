import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session) redirect('/admin/login')
  if (session.user.role !== 'SUPERADMIN') redirect('/admin/dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}
