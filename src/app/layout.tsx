import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tarjetas de Fidelización',
  description: 'Programa de fidelización con Apple Wallet y Google Wallet',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
