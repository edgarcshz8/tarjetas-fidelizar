import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { upsertLoyaltyClass, patchGoogleObjectLocation } from '@/lib/google-wallet'
import { checkActiveSubscriptionWithTier } from '@/lib/subscriptionGuard'

export const runtime = 'nodejs'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  logoUrl: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  locationName: z.string().max(100).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  proximityEnabled: z.boolean().optional(),
})

// GET → obtener info del negocio
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
  })

  return NextResponse.json({ business })
}

// PATCH → actualizar info del negocio
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const subCheck = await checkActiveSubscriptionWithTier(session.user.businessId)
  if (!subCheck.allowed) return NextResponse.json({ error: subCheck.error }, { status: subCheck.status })

  const body = await req.json()
  const data = updateSchema.parse(body)

  // Strip geofencing fields for BASIC plan — silent, UI already hides them
  if (subCheck.tier === 'BASIC') {
    data.latitude = undefined
    data.longitude = undefined
    data.locationName = undefined
    data.address = undefined
    data.proximityEnabled = undefined
  }

  const business = await prisma.business.update({
    where: { id: session.user.businessId },
    data,
  })

  // Cuando cambian coordenadas o el toggle de proximidad, actualizar la clase de Google Wallet.
  // Fire-and-forget: no bloqueamos la respuesta al admin.
  if (data.latitude !== undefined || data.longitude !== undefined || data.locationName !== undefined || data.proximityEnabled !== undefined) {
    prisma.loyaltyProgram.findMany({
      where: { businessId: session.user.businessId, isActive: true },
      include: { business: true },
    }).then(programs => {
      for (const program of programs) {
        upsertLoyaltyClass(program).catch(err =>
          console.error(`[businesses] upsertLoyaltyClass programId=${program.id}:`, err?.message ?? err)
        )
      }
    }).catch(err => console.error('[businesses] findPrograms for location sync:', err))
  }

  // Also PATCH all existing Google Wallet objects with the new coordinates.
  // This fixes passes already saved before the location was configured.
  if (data.latitude != null && data.longitude != null) {
    const lat = data.latitude
    const lng = data.longitude
    prisma.customerPass.findMany({
      where: {
        program: { businessId: session.user.businessId },
        googleObjectId: { not: null },
      },
      select: { googleObjectId: true },
    }).then(passes => {
      for (const pass of passes) {
        if (!pass.googleObjectId) continue
        patchGoogleObjectLocation(pass.googleObjectId, lat, lng).catch(err =>
          console.error(`[businesses] patchGoogleObjectLocation objectId=${pass.googleObjectId}:`, err?.message ?? err)
        )
      }
    }).catch(err => console.error('[businesses] findPasses for location sync:', err))
  }

  return NextResponse.json({ business })
}
