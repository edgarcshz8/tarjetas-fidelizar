import type { Metadata } from 'next'
import './globals.css'
import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
import Providers from '@/components/Providers'
config.autoAddCss = false

export const metadata: Metadata = {
  title: 'MisStamps',
  description: 'Programa de fidelización con Apple Wallet y Google Wallet',
  icons: {
    icon:  '/favicon.webp',
    apple: '/favicon.webp',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
