import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import AdminNav from '@/components/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  // Si no hay sesión, el middleware ya redirigió a /admin/login.
  // Este layout solo se renderiza para rutas protegidas.
  if (!session) {
    // Renderizar sin nav (ej: página de login)
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav session={session} />
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
