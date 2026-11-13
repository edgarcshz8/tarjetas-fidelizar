import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  upsertLoyaltyClass,
  fetchGoogleWalletClassRaw,
  fetchGoogleWalletObjectRaw,
} from '@/lib/google-wallet'
import { pushPassUpdate } from '@/lib/apns'

export const runtime = 'nodejs'

// GET /api/admin/geo-debug
// Devuelve el estado actual de geofencing: coordenadas en DB + JSON real de Google Wallet.
// Acceso: OWNER o ADMIN.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { name: true, latitude: true, longitude: true, locationName: true },
  })

  const program = await prisma.loyaltyProgram.findFirst({
    where: { businessId: session.user.businessId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })

  if (!program) {
    return NextResponse.json({ error: 'Sin programa activo' }, { status: 404 })
  }

  // Muestra hasta 5 pases (serial, objectId Google, timestamp Apple, nº dispositivos)
  const passes = await prisma.customerPass.findMany({
    where: { programId: program.id },
    select: {
      serialNumber:      true,
      googleObjectId:    true,
      applePassUpdatedAt: true,
      _count: { select: { devices: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 5,
  })

  // ── Google Wallet: consulta real a la API ──────────────────────────────────
  let googleClass: any = null
  let googleClassError: string | null = null
  try {
    googleClass = await fetchGoogleWalletClassRaw(program.id)
  } catch (err: any) {
    googleClassError = err?.response?.data?.error?.message ?? err?.message ?? String(err)
  }

  const passWithObject = passes.find(p => p.googleObjectId)
  let googleObject: any = null
  let googleObjectError: string | null = null
  if (passWithObject?.googleObjectId) {
    try {
      googleObject = await fetchGoogleWalletObjectRaw(passWithObject.googleObjectId)
    } catch (err: any) {
      googleObjectError = err?.response?.data?.error?.message ?? err?.message ?? String(err)
    }
  }

  return NextResponse.json({
    db: {
      business,
      programId:   program.id,
      programName: program.name,
      passes: passes.map(p => ({
        serialNumber:          p.serialNumber,
        googleObjectId:        p.googleObjectId,
        applePassUpdatedAt:    p.applePassUpdatedAt,
        appleDevicesRegistered: p._count.devices,
      })),
    },
    google: {
      classId:          `${process.env.GOOGLE_WALLET_ISSUER_ID}.program_${program.id}`,
      // Buscar "locations" en class y object para confirmar que están
      classLocations:   googleClass?.locations   ?? null,
      objectLocations:  googleObject?.locations  ?? null,
      classError:       googleClassError,
      objectError:      googleObjectError,
      // JSON completo para inspección
      classRaw:         googleClass,
      objectRaw:        googleObject,
    },
  })
}

// POST /api/admin/geo-debug
// Fuerza la actualización de geofencing en todos los pases:
//   · Google Wallet: actualiza la clase con las coordenadas actuales de la DB
//   · Apple Wallet: bump applePassUpdatedAt + APNs push a todos los dispositivos
// Usar después de guardar coordenadas en Configuración si las tarjetas ya
// descargadas no reflejan el cambio.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const programs = await prisma.loyaltyProgram.findMany({
    where: { businessId: session.user.businessId, isActive: true },
    include: { business: true },
  })

  if (programs.length === 0) {
    return NextResponse.json({ error: 'Sin programas activos' }, { status: 404 })
  }

  const results: Record<string, any> = {}

  for (const program of programs) {
    // ── Google: actualizar clase con coordenadas actuales ──────────────────
    try {
      await upsertLoyaltyClass(program)
      const updatedClass = await fetchGoogleWalletClassRaw(program.id)
      results[program.id] = {
        programName:    program.name,
        googleLocations: updatedClass.locations ?? 'none',
        googleStatus:   'ok',
      }
    } catch (err: any) {
      results[program.id] = {
        programName:  program.name,
        googleStatus: 'error',
        googleError:  err?.message ?? String(err),
      }
    }

    // ── Google: actualizar cada objeto con coordenadas ─────────────────────
    const passes = await prisma.customerPass.findMany({
      where: { programId: program.id },
      include: { customer: true },
    })

    let googleObjectsOk = 0
    let googleObjectsFailed = 0
    for (const pass of passes) {
      if (!pass.googleObjectId) continue
      const passData = { ...pass, program, customer: pass.customer }
      const { latitude, longitude } = program.business
      if (latitude == null || longitude == null) continue
      try {
        const { GoogleAuth } = await import('google-auth-library')
        const { getServiceAccountCredentials } = await import('@/lib/google-credentials')
        const { email, privateKey } = getServiceAccountCredentials()
        const auth = new GoogleAuth({
          credentials: { client_email: email, private_key: privateKey },
          scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
        })
        const client = await auth.getClient()
        await (client as any).request({
          url: `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(pass.googleObjectId)}`,
          method: 'PATCH',
          data: { locations: [{ latitude, longitude }] },
        })
        googleObjectsOk++
      } catch (err: any) {
        console.error(`[geo-debug] PATCH object ${pass.googleObjectId}:`, err?.response?.data?.error?.message ?? err?.message)
        googleObjectsFailed++
      }
    }
    results[program.id].googleObjectsOk     = googleObjectsOk
    results[program.id].googleObjectsFailed = googleObjectsFailed

    // ── Apple: bump timestamp + APNs push ─────────────────────────────────
    if (passes.length > 0) {
      await prisma.customerPass.updateMany({
        where: { id: { in: passes.map(p => p.id) } },
        data: { applePassUpdatedAt: new Date() },
      })

      let applePushed = 0
      let appleFailed = 0
      for (const pass of passes) {
        try {
          await pushPassUpdate(pass.serialNumber)
          applePushed++
        } catch {
          appleFailed++
        }
      }
      results[program.id].applePasses = passes.length
      results[program.id].applePushed = applePushed
      results[program.id].appleFailed = appleFailed
    }
  }

  return NextResponse.json({ ok: true, results })
}
