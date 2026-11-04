'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Session } from 'next-auth'

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/admin/scanner', label: 'Escanear', icon: '📷' },
  { href: '/admin/customers', label: 'Clientes', icon: '👥' },
  { href: '/admin/settings', label: 'Configuración', icon: '⚙️' },
]

export default function AdminNav({ session }: { session: Session }) {
  const pathname = usePathname()

  return (
    <header className="bg-slate-900 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <Link href="/admin/dashboard" className="font-bold text-lg">
              🃏 Fidelizar
            </Link>
            <nav className="hidden md:flex gap-1">
              {navItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    pathname === item.href
                      ? 'bg-white/20 text-white'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400 hidden md:block">
              {session.user.businessName}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/admin/login' })}
              className="text-sm text-slate-300 hover:text-white transition"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="md:hidden flex gap-1 pb-3">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium flex-1 transition ${
                pathname === item.href
                  ? 'bg-white/20 text-white'
                  : 'text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
