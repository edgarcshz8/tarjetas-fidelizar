import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGift } from '@fortawesome/free-solid-svg-icons'

const PAGE_SIZE = 15

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { search?: string; page?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/admin/login')

  const search = searchParams.search || ''
  const page  = Math.max(1, parseInt(searchParams.page || '1'))

  const whereFilter = {
    program: { businessId: session.user.businessId },
    ...(search
      ? {
          customer: {
            OR: [
              { name:  { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
  }

  const [passes, total] = await Promise.all([
    prisma.customerPass.findMany({
      where: whereFilter,
      include: {
        customer: true,
        program: { select: { name: true, stampsRequired: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * PAGE_SIZE,
      take:  PAGE_SIZE,
    }),
    prisma.customerPass.count({ where: whereFilter }),
  ])

  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const firstOnPage = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastOnPage  = Math.min(page * PAGE_SIZE, total)

  function pageHref(p: number) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('page', String(p))
    return `?${params.toString()}`
  }

  // Show at most 5 page buttons centred around current page
  const delta = 2
  const pageNums: number[] = []
  for (let p = Math.max(1, page - delta); p <= Math.min(totalPages, page + delta); p++) {
    pageNums.push(p)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500">
            {search
              ? `${total} resultado${total !== 1 ? 's' : ''} para "${search}"`
              : `${total} cliente${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Buscador */}
      <form method="GET" className="mb-6">
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Buscar por nombre o email..."
          className="w-full md:w-80 px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
      </form>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Email</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Sellos</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Premios</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {passes.map(pass => (
              <tr key={pass.id} className="hover:bg-gray-50 transition">
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900">{pass.customer.name}</p>
                  <p className="text-sm text-gray-500 md:hidden">{pass.customer.email}</p>
                </td>
                <td className="px-6 py-4 text-gray-600 hidden md:table-cell">{pass.customer.email}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-700 rounded-full"
                        style={{
                          width: `${Math.min((pass.currentStamps / pass.program.stampsRequired) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-gray-700">
                      {pass.currentStamps}/{pass.program.stampsRequired}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-600 hidden md:table-cell">
                  {pass.totalRewardsEarned}
                </td>
                <td className="px-6 py-4">
                  {pass.rewardReady ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                      <FontAwesomeIcon icon={faGift} className="w-3 h-3" /> Premio listo
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                      Activo
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {passes.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            {search ? 'No se encontraron clientes' : 'Aún no hay clientes registrados'}
          </div>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-sm text-gray-500">
            Mostrando {firstOnPage}–{lastOnPage} de {total} clientes
          </p>

          <div className="flex items-center gap-1">
            {/* Anterior */}
            {page > 1 ? (
              <a
                href={pageHref(page - 1)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                ←
              </a>
            ) : (
              <span className="px-3 py-2 border border-gray-100 rounded-lg text-sm text-gray-300 cursor-not-allowed">←</span>
            )}

            {/* Primera página + ellipsis */}
            {pageNums[0] > 1 && (
              <>
                <a href={pageHref(1)} className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition">1</a>
                {pageNums[0] > 2 && <span className="px-2 text-gray-400 text-sm">…</span>}
              </>
            )}

            {/* Páginas del rango */}
            {pageNums.map(p => (
              <a
                key={p}
                href={pageHref(p)}
                className={`px-3 py-2 border rounded-lg text-sm transition ${
                  p === page
                    ? 'bg-slate-900 border-slate-900 text-white font-semibold'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {p}
              </a>
            ))}

            {/* Ellipsis + última página */}
            {pageNums[pageNums.length - 1] < totalPages && (
              <>
                {pageNums[pageNums.length - 1] < totalPages - 1 && <span className="px-2 text-gray-400 text-sm">…</span>}
                <a href={pageHref(totalPages)} className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition">{totalPages}</a>
              </>
            )}

            {/* Siguiente */}
            {page < totalPages ? (
              <a
                href={pageHref(page + 1)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                →
              </a>
            ) : (
              <span className="px-3 py-2 border border-gray-100 rounded-lg text-sm text-gray-300 cursor-not-allowed">→</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
