import { NextResponse, type NextRequest } from 'next/server'

// La autenticación del panel se valida en src/app/admin/layout.tsx y en cada API
// con getServerSession, por eso aquí no se usa withAuth.

export function middleware(req: NextRequest) {
  // La app no usa Server Actions: cualquier petición con "Next-Action" viene de bots/escáneres.
  if (req.headers.has('next-action')) {
    return new NextResponse(null, { status: 400 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
