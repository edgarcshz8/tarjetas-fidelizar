import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// GET /api/public/businesses/[slug]
// Endpoint público — devuelve solo los campos mínimos necesarios para la página de suscripción.
// No expone datos sensibles ni requiere sesión.
export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const { slug } = params

  if (!slug) {
    return NextResponse.json({ error: 'slug requerido' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
    },
  })

  if (!business) {
    return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })
  }

  return NextResponse.json(business)
}
