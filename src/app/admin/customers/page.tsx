import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGift } from '@fortawesome/free-solid-svg-icons'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { search?: string; page?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/admin/login')

  const search = searchParams.search || ''
  const page = parseInt(searchParams.page || '1')
  const pageSize = 20

  const [passes, total] = await Promise.all([
    prisma.customerPass.findMany({
      where: {
        program: { businessId: session.user.businessId },
        customer: search
          ? {
              OR: [
                { name: { contains: search } },
                { email: { contains: search } },
              ],
            }
          : undefined,
      },
      include: {
        customer: true,
        program: { select: { name: true, stampsRequired: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customerPass.count({
      where: { program: { businessId: session.user.businessId } },
    }),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500">{total} clientes registrados</p>
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
      {total > pageSize && (
        <div className="mt-6 flex justify-center gap-2">
          {page > 1 && (
            <a
              href={`?page=${page - 1}&search=${search}`}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              ← Anterior
            </a>
          )}
          {page * pageSize < total && (
            <a
              href={`?page=${page + 1}&search=${search}`}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              Siguiente →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
