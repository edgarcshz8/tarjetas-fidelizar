import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateQRDataURL } from '@/lib/qr'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/admin/login')

  const rawAppUrl = process.env.APP_URL || 'http://localhost:3000'
  // Ensure APP_URL always has a protocol (guards against missing https:// in env)
  const appUrl = /^https?:\/\//.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`
  const registrationUrl = `${appUrl}/${session.user.businessSlug}`

  let stats: Awaited<ReturnType<typeof fetchStats>>
  let program: Awaited<ReturnType<typeof prisma.loyaltyProgram.findFirst>>
  let qrDataUrl: string

  try {
    ;[stats, program, qrDataUrl] = await Promise.all([
      fetchStats(session.user.businessId),
      prisma.loyaltyProgram.findFirst({
        where: { businessId: session.user.businessId, isActive: true },
      }),
      generateQRDataURL(registrationUrl),
    ])
  } catch {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-5xl mb-4">⚠️</p>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Error al cargar el dashboard</h2>
        <p className="text-gray-500 mb-6">No se pudieron obtener los datos. Intenta recargar la página.</p>
        <a
          href="/admin/dashboard"
          className="px-5 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 transition"
        >
          Recargar
        </a>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">{session.user.businessName}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Clientes" value={stats.totalCustomers} icon="👥" />
        <StatCard label="Sellos Dados" value={stats.totalStamps} icon="⭐" />
        <StatCard label="Premios Canjeados" value={stats.totalRewards} icon="🎁" />
        <StatCard label="Premios Pendientes" value={stats.pendingRewards} icon="⏳" highlight={stats.pendingRewards > 0} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* QR de registro */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">QR de Registro</h2>
          <p className="text-sm text-gray-500 mb-4">Muestra este QR en tu local para que los clientes se registren</p>
          <div className="flex flex-col items-center">
            <img src={qrDataUrl} alt="QR de registro" className="w-48 h-48" />
            <p className="mt-3 text-xs text-gray-400 break-all text-center">{registrationUrl}</p>
            <a
              href={registrationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 px-4 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-700 transition"
            >
              Ver página de registro
            </a>
          </div>
        </div>

        {/* Resumen del programa */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Programa Activo</h2>
          {program ? (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs text-gray-500 font-medium">NOMBRE</p>
                <p className="text-gray-900 font-medium">{program.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">SELLOS REQUERIDOS</p>
                <p className="text-3xl font-bold text-slate-900">{program.stampsRequired}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">PREMIO</p>
                <p className="text-gray-900">{program.rewardDescription}</p>
              </div>
              <a
                href="/admin/settings"
                className="inline-block mt-2 text-sm text-slate-600 underline"
              >
                Editar configuración →
              </a>
            </div>
          ) : (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
              No hay programa activo.{' '}
              <a href="/admin/settings" className="font-semibold underline">
                Configurar ahora
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string
  value: number
  icon: string
  highlight?: boolean
}) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border p-5 ${highlight ? 'border-amber-300 bg-amber-50' : 'border-gray-100'}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-3xl font-bold ${highlight ? 'text-amber-700' : 'text-gray-900'}`}>{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  )
}

async function fetchStats(businessId: string) {
  const [totalCustomers, totalStamps, totalRewardsAgg, pendingRewards] = await Promise.all([
    prisma.customerPass.count({ where: { program: { businessId } } }),
    prisma.stamp.count({ where: { pass: { program: { businessId } } } }),
    prisma.customerPass.aggregate({
      where: { program: { businessId } },
      _sum: { totalRewardsEarned: true },
    }),
    prisma.customerPass.count({ where: { program: { businessId }, rewardReady: true } }),
  ])

  return {
    totalCustomers,
    totalStamps,
    totalRewards: totalRewardsAgg._sum.totalRewardsEarned || 0,
    pendingRewards,
  }
}
