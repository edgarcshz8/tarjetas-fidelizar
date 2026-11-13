import { GoogleAuth } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import { LoyaltyProgram, CustomerPass, Customer } from '@prisma/client'
import { getServiceAccountCredentials } from './google-credentials'

export type GooglePassData = CustomerPass & {
  customer: Customer
  program: LoyaltyProgram & {
    business: {
      name: string
      slug: string
      latitude?: number | null
      longitude?: number | null
    }
  }
}

const GOOGLE_WALLET_API = 'https://walletobjects.googleapis.com/walletobjects/v1'

function getGoogleAuth(): GoogleAuth {
  const { email, privateKey } = getServiceAccountCredentials()
  return new GoogleAuth({
    credentials: { client_email: email, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  })
}

function getIssuerId(): string {
  const id = process.env.GOOGLE_WALLET_ISSUER_ID
  if (!id) throw new Error('GOOGLE_WALLET_ISSUER_ID no configurado')
  return id
}

// ─── LOYALTY CLASS ───────────────────────────────────────────────────────────

export function buildLoyaltyClassId(programId: string): string {
  return `${getIssuerId()}.program_${programId}`
}

export async function upsertLoyaltyClass(
  program: LoyaltyProgram & { business: { name: string; latitude?: number | null; longitude?: number | null } }
): Promise<string> {
  const auth = getGoogleAuth()
  const client = await auth.getClient()
  const classId = buildLoyaltyClassId(program.id)

  const rawLogoUrl = program.logoUrl || program.stampIconUrl
  const logoUrl = rawLogoUrl?.startsWith('http')
    ? rawLogoUrl
    : `https://placehold.co/300x300/${program.backgroundColor.replace('#', '')}/${program.foregroundColor.replace('#', '')}?text=Logo`

  const loyaltyClass: Record<string, any> = {
    id: classId,
    issuerName: program.business.name,
    programName: program.name,
    rewardsTier: 'STANDARD',
    rewardsTierPoints: 'Sellos',
    loyaltyPoints: {
      label: 'Sellos',
      balance: { string: `0 / ${program.stampsRequired}` },
    },
    hexBackgroundColor: program.backgroundColor,
    reviewStatus: 'UNDER_REVIEW',
    programLogo: {
      sourceUri: { uri: logoUrl },
      contentDescription: {
        defaultValue: { language: 'es', value: program.business.name },
      },
    },
  }

  // Geofencing: aparece en Google Wallet cuando el cliente está cerca
  if (program.business.latitude != null && program.business.longitude != null) {
    loyaltyClass.locations = [
      { latitude: program.business.latitude, longitude: program.business.longitude },
    ]
  }

  const lat = program.business.latitude ?? 'none'

  // Paso 1: verificar si la clase existe. Solo capturamos 404; cualquier otro error (401, 403…) se relanza.
  let classExists = false
  try {
    await (client as any).request({
      url: `${GOOGLE_WALLET_API}/loyaltyClass/${encodeURIComponent(classId)}`,
      method: 'GET',
    })
    classExists = true
  } catch (err: any) {
    const status = err?.response?.status ?? err?.status
    if (status !== 404) {
      console.error(`[google-wallet] upsertLoyaltyClass GET error classId=${classId} status=${status}:`, err?.response?.data?.error?.message ?? err?.message)
      throw err
    }
  }

  // Paso 2: crear o actualizar (errores separados, no se mezclan)
  if (classExists) {
    try {
      await (client as any).request({
        url: `${GOOGLE_WALLET_API}/loyaltyClass/${encodeURIComponent(classId)}`,
        method: 'PUT',
        data: loyaltyClass,
      })
      console.log(`[google-wallet] upsertLoyaltyClass PUT classId=${classId} lat=${lat}`)
    } catch (err: any) {
      console.error(`[google-wallet] upsertLoyaltyClass PUT error classId=${classId}:`, err?.response?.data?.error?.message ?? err?.message)
      throw err
    }
  } else {
    try {
      await (client as any).request({
        url: `${GOOGLE_WALLET_API}/loyaltyClass`,
        method: 'POST',
        data: loyaltyClass,
      })
      console.log(`[google-wallet] upsertLoyaltyClass POST classId=${classId} lat=${lat}`)
    } catch (err: any) {
      console.error(`[google-wallet] upsertLoyaltyClass POST error classId=${classId}:`, err?.response?.data?.error?.message ?? err?.message)
      throw err
    }
  }

  return classId
}

// ─── LOYALTY OBJECT ──────────────────────────────────────────────────────────

export function buildObjectId(serialNumber: string): string {
  return `${getIssuerId()}.pass_${serialNumber}`
}

export async function createLoyaltyObject(passData: GooglePassData): Promise<string> {
  const auth = getGoogleAuth()
  const client = await auth.getClient()
  const { program, customer, serialNumber, currentStamps, rewardReady } = passData

  const classId = buildLoyaltyClassId(program.id)
  const objectId = buildObjectId(serialNumber)

  const loyaltyObject = buildLoyaltyObjectPayload({
    objectId,
    classId,
    serialNumber,
    customer,
    currentStamps,
    stampsRequired: program.stampsRequired,
    rewardDescription: program.rewardDescription,
    stampEmoji: program.stampEmoji ?? '⭐',
    rewardReady,
  })

  await (client as any).request({
    url: `${GOOGLE_WALLET_API}/loyaltyObject`,
    method: 'POST',
    data: loyaltyObject,
  })

  return objectId
}

export async function updateLoyaltyObject(passData: GooglePassData): Promise<void> {
  if (!passData.googleObjectId) return

  const auth = getGoogleAuth()
  const client = await auth.getClient()
  const { program, customer, serialNumber, googleObjectId, currentStamps, rewardReady } = passData
  const classId = buildLoyaltyClassId(program.id)

  const payload = buildLoyaltyObjectPayload({
    objectId: googleObjectId,
    classId,
    serialNumber,
    customer,
    currentStamps,
    stampsRequired: program.stampsRequired,
    rewardDescription: program.rewardDescription,
    stampEmoji: program.stampEmoji ?? '⭐',
    rewardReady,
  })

  const { latitude, longitude } = program.business

  const patchData: Record<string, any> = {
    loyaltyPoints:   payload.loyaltyPoints,
    textModulesData: payload.textModulesData,
    heroImage:       payload.heroImage,
  }

  // Incluir coordenadas en el objeto para geofencing a nivel de object
  // (belt + suspenders: la clase también las tiene vía upsertLoyaltyClass)
  if (latitude != null && longitude != null) {
    patchData.locations = [{ latitude, longitude }]
  }

  try {
    await (client as any).request({
      url: `${GOOGLE_WALLET_API}/loyaltyObject/${encodeURIComponent(googleObjectId)}`,
      method: 'PATCH',
      data: patchData,
    })
    console.log(`[google-wallet] updateLoyaltyObject PATCH objectId=${googleObjectId} stamps=${currentStamps} lat=${latitude ?? 'none'}`)
  } catch (err: any) {
    console.error(`[google-wallet] updateLoyaltyObject PATCH error objectId=${googleObjectId}:`, err?.response?.data?.error?.message ?? err?.message)
    throw err
  }
}

function buildLoyaltyObjectPayload(params: {
  objectId: string
  classId: string
  serialNumber: string
  customer: Customer
  currentStamps: number
  stampsRequired: number
  rewardDescription: string
  stampEmoji?: string
  rewardReady: boolean
}) {
  const { objectId, classId, serialNumber, customer, currentStamps, stampsRequired, rewardDescription, stampEmoji = '⭐', rewardReady } = params

  const rawAppUrl = process.env.APP_URL || 'http://localhost:3000'
  const appUrl    = /^https?:\/\//.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`

  // heroImage: 1032×336 PNG with the same 2-row stamp strip as Apple Wallet.
  // ?v= busts the Google CDN cache each time the stamp count changes.
  const heroImageUri = `${appUrl}/api/passes/google/strip/${serialNumber}?v=${currentStamps}`

  return {
    id: objectId,
    classId,
    state: 'ACTIVE',
    accountId: customer.id,
    accountName: customer.name,
    loyaltyPoints: {
      label: rewardReady ? '🎉 PREMIO LISTO' : 'SELLOS',
      balance: {
        string: rewardReady ? '¡Reclama tu premio!' : `${currentStamps} / ${stampsRequired}`,
      },
    },
    heroImage: {
      sourceUri: { uri: heroImageUri },
      contentDescription: {
        defaultValue: { language: 'es', value: 'Progreso de sellos' },
      },
    },
    textModulesData: [
      {
        id: 'reward',
        header: 'TU PREMIO',
        body: rewardDescription,
      },
      {
        id: 'progress',
        header: `PROGRESO: ${currentStamps} / ${stampsRequired}`,
        body: rewardReady
          ? '¡Completaste todos los sellos! Muestra esta tarjeta al comerciante.'
          : `Te faltan ${stampsRequired - currentStamps} sello(s) para tu premio.`,
      },
    ],
    barcode: {
      type: 'QR_CODE',
      value: objectId.split('.pass_')[1] || objectId,
      alternateText: `ID: ${objectId.slice(-8)}`,
    },
  }
}

// ─── PUSH NOTIFICATION VÍA addMessage ────────────────────────────────────────
// addMessage triggers a push to the user's device AND causes Google Wallet
// to re-fetch the loyalty object, so the updated stamp count appears immediately.

export async function pushGoogleWalletMessage(
  googleObjectId: string,
  currentStamps: number,
  stampsRequired: number,
  rewardReady: boolean,
  stampEmoji: string = '⭐',
): Promise<void> {
  const auth = getGoogleAuth()
  const client = await auth.getClient()

  const header = rewardReady ? '🎉 ¡Premio listo!' : `${stampEmoji} ¡Nuevo sello!`
  const body   = rewardReady
    ? '¡Completaste todos tus sellos! Muestra esta tarjeta al comerciante.'
    : `Tienes ${currentStamps} de ${stampsRequired} sellos.`

  await (client as any).request({
    url: `${GOOGLE_WALLET_API}/loyaltyObject/${encodeURIComponent(googleObjectId)}/addMessage`,
    method: 'POST',
    data: {
      message: {
        header,
        body,
        id:          `stamp_${Date.now()}`,
        messageType: 'TEXT',
      },
    },
  })
}

// ─── JWT PARA "SAVE TO GOOGLE WALLET" ────────────────────────────────────────

export function generateSaveToWalletJwt(objectId: string): string {
  const { email: serviceAccountEmail, privateKey } = getServiceAccountCredentials()

  const claims = {
    iss: serviceAccountEmail as string,
    aud: 'google',
    origins: [process.env.APP_URL || 'http://localhost:3000'],
    typ: 'savetowallet',
    payload: {
      loyaltyObjects: [{ id: objectId }],
    },
  }

  return jwt.sign(claims, privateKey, { algorithm: 'RS256' })
}

export function getSaveToWalletUrl(objectId: string): string {
  const token = generateSaveToWalletJwt(objectId)
  return `https://pay.google.com/gp/v/save/${token}`
}

// ─── NOTIFICACIÓN DE CUMPLEAÑOS ───────────────────────────────────────────────

// ─── DIAGNÓSTICO: consulta directa a la API de Google ───────────────────────
// Devuelven el JSON exacto que Google tiene guardado en este momento.

export async function fetchGoogleWalletClassRaw(programId: string): Promise<Record<string, any>> {
  const auth = getGoogleAuth()
  const client = await auth.getClient()
  const classId = buildLoyaltyClassId(programId)
  const res = await (client as any).request({
    url: `${GOOGLE_WALLET_API}/loyaltyClass/${encodeURIComponent(classId)}`,
    method: 'GET',
  })
  return res.data
}

export async function fetchGoogleWalletObjectRaw(objectId: string): Promise<Record<string, any>> {
  const auth = getGoogleAuth()
  const client = await auth.getClient()
  const res = await (client as any).request({
    url: `${GOOGLE_WALLET_API}/loyaltyObject/${encodeURIComponent(objectId)}`,
    method: 'GET',
  })
  return res.data
}

export async function pushBirthdayNotification(
  googleObjectId: string,
  header: string,
  body: string,
): Promise<void> {
  const auth = getGoogleAuth()
  const client = await auth.getClient()

  await (client as any).request({
    url: `${GOOGLE_WALLET_API}/loyaltyObject/${encodeURIComponent(googleObjectId)}/addMessage`,
    method: 'POST',
    data: {
      message: {
        header,
        body,
        id: `birthday_${Date.now()}`,
        messageType: 'TEXT',
      },
    },
  })
}
