import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/admin/login',
    },
  }
)

// Solo proteger las rutas del panel (NO la página de login ni las API de passes/register)
export const config = {
  matcher: [
    '/admin/dashboard/:path*',
    '/admin/scanner/:path*',
    '/admin/customers/:path*',
    '/admin/settings/:path*',
    '/api/stamp',
    '/api/redeem',
    '/api/admin/:path*',
  ],
}
