import { withAuth, type NextRequestWithAuth } from 'next-auth/middleware'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'

// Nota: con el código en src/app, Next.js solo lee src/middleware.ts (el de la raíz se ignoraba).

const authMiddleware = withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
  pages: {
    signIn: '/admin/login',
  },
})

// Solo proteger las rutas del panel (NO la página de login ni las API de passes/register)
const PROTECTED_ROUTES = [
  /^\/admin\/?$/,
  /^\/admin\/(dashboard|scanner|customers|settings)(\/.*)?$/,
  /^\/api\/(stamp|redeem)\/?$/,
  /^\/api\/admin(\/.*)?$/,
]

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  // La app no usa Server Actions: cualquier petición con "Next-Action" viene de bots/escáneres.
  if (req.headers.has('next-action')) {
    return new NextResponse(null, { status: 400 })
  }

  if (PROTECTED_ROUTES.some((re) => re.test(req.nextUrl.pathname))) {
    return authMiddleware(req as NextRequestWithAuth, event)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
