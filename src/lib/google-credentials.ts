// Carga y normaliza las credenciales de la Service Account de Google.
// Soporta (en orden de prioridad):
//   1. GOOGLE_SERVICE_ACCOUNT_BASE64  → JSON completo de la service account en base64 (recomendado)
//   2. GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
//      (la key puede venir con \n literales, comillas, \r\n, o incluso como el JSON completo)
//   3. GOOGLE_SERVICE_ACCOUNT_KEY_FILE → ruta al .json (desarrollo local)

export type ServiceAccountCredentials = { email: string; privateKey: string }

const PEM_HEADER = /-----BEGIN (RSA )?PRIVATE KEY-----/
const PEM_FOOTER = /-----END (RSA )?PRIVATE KEY-----/

function stripQuotes(value: string): string {
  let v = value.trim()
  while (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
  ) {
    v = v.slice(1, -1).trim()
  }
  return v
}

export function normalizePrivateKey(raw: string): string {
  let key = stripQuotes(raw)

  // Si pegaron el JSON completo de la service account en la variable
  if (key.startsWith('{')) {
    try {
      const json = JSON.parse(key)
      if (json.private_key) key = String(json.private_key)
    } catch {
      /* no es JSON válido, seguimos */
    }
  }

  key = key
    .replace(/\\r/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '')
    .trim()

  // Si la key quedó en una sola línea (espacios en vez de saltos), reconstruir el PEM
  const header = key.match(PEM_HEADER)
  const footer = key.match(PEM_FOOTER)
  if (!header || !footer) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY no es una clave PEM válida (falta BEGIN/END PRIVATE KEY)'
    )
  }
  const body = key
    .slice(key.indexOf(header[0]) + header[0].length, key.indexOf(footer[0]))
    .replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) ?? []
  return `${header[0]}\n${lines.join('\n')}\n${footer[0]}\n`
}

function fromJson(json: any, source: string): ServiceAccountCredentials {
  if (!json?.client_email || !json?.private_key) {
    throw new Error(`${source} no contiene client_email y private_key`)
  }
  return { email: String(json.client_email).trim(), privateKey: normalizePrivateKey(json.private_key) }
}

let cached: ServiceAccountCredentials | null = null

export function getServiceAccountCredentials(): ServiceAccountCredentials {
  if (cached) return cached

  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64
  if (b64) {
    let json: any
    try {
      json = JSON.parse(Buffer.from(stripQuotes(b64), 'base64').toString('utf-8'))
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_BASE64 no es un JSON en base64 válido')
    }
    return (cached = fromJson(json, 'GOOGLE_SERVICE_ACCOUNT_BASE64'))
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (email && key) {
    return (cached = { email: stripQuotes(email), privateKey: normalizePrivateKey(key) })
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    const fs = require('fs')
    const path = require('path')
    const filePath = path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE)
    const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return (cached = fromJson(json, filePath))
  }

  throw new Error('Credenciales de Google Wallet no configuradas')
}
