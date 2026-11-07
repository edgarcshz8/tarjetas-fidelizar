import { PKPass } from 'passkit-generator'
import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'
import { LoyaltyProgram, CustomerPass, Customer } from '@prisma/client'

export type PassData = CustomerPass & {
  customer: Customer
  program: LoyaltyProgram & { business: { name: string; slug: string } }
}

// ─── Helpers de color ────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const r = hexToRgbTuple(hex)
  return `rgb(${r[0]},${r[1]},${r[2]})`
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return [0, 0, 0]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

// Loads a certificate from base64 env var (production/Docker) or from a file (local dev).
function loadCert(b64Value: string | undefined, filePath: string): Buffer {
  if (b64Value) {
    return Buffer.from(b64Value, 'base64')
  }
  const resolved = path.resolve(process.cwd(), filePath)
  return fs.readFileSync(resolved)
}

// ─── Generador de strip PNG ──────────────────────────────────────────────────
//
// Dibuja N círculos en fila:
//   · Ganados  → círculo relleno en foregroundColor
//   · Pendientes → anillo vacío (semi-transparente)
//
// La imagen se posiciona en el tercio superior del strip para no
// solaparse con el texto del primaryField que Apple Wallet
// renderiza en la parte inferior de esa misma área.

function generateStripPNG(
  current: number,
  total: number,
  bgHex: string,
  fgHex: string,
  w: number,
  h: number,
): Buffer {
  const png = new PNG({ width: w, height: h })
  const bg = hexToRgbTuple(bgHex)
  const fg = hexToRgbTuple(fgHex)

  // Fondo sólido
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4 + 0] = bg[0]
    png.data[i * 4 + 1] = bg[1]
    png.data[i * 4 + 2] = bg[2]
    png.data[i * 4 + 3] = 255
  }

  const n = Math.min(total, 10)
  const r = Math.min(h * 0.26, (w * 0.9) / (n * 2.6))
  const gap = r * 0.55
  const totalW = n * 2 * r + (n - 1) * gap
  const startX = (w - totalW) / 2 + r
  // Círculos en el tercio superior para dejar espacio al texto
  const cy = h * 0.38

  function setPixel(px: number, py: number, cr: number, cg: number, cb: number, alpha: number) {
    if (px < 0 || px >= w || py < 0 || py >= h) return
    const idx = (Math.round(py) * w + Math.round(px)) * 4
    const a = alpha / 255
    png.data[idx + 0] = Math.round(bg[0] * (1 - a) + cr * a)
    png.data[idx + 1] = Math.round(bg[1] * (1 - a) + cg * a)
    png.data[idx + 2] = Math.round(bg[2] * (1 - a) + cb * a)
    png.data[idx + 3] = 255
  }

  for (let i = 0; i < n; i++) {
    const cx = startX + i * (2 * r + gap)
    const earned = i < current
    const strokeW = Math.max(1.5, r * 0.13)

    const x0 = Math.floor(cx - r - 1)
    const x1 = Math.ceil(cx + r + 1)
    const y0 = Math.floor(cy - r - 1)
    const y1 = Math.ceil(cy + r + 1)

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)

        if (earned) {
          const aa = Math.max(0, Math.min(1, r - dist + 0.8))
          if (aa > 0) setPixel(px, py, fg[0], fg[1], fg[2], Math.round(aa * 255))
        } else {
          const inner = r - strokeW
          const outerAA = Math.max(0, Math.min(1, r - dist + 0.8))
          const innerAA = Math.max(0, Math.min(1, dist - inner + 0.8))
          const aa = Math.min(outerAA, innerAA)
          if (aa > 0) setPixel(px, py, fg[0], fg[1], fg[2], Math.round(aa * 115))
        }

        if (earned) {
          const glowCx = cx - r * 0.28
          const glowCy = cy - r * 0.28
          const glowDist = Math.sqrt((px - glowCx) ** 2 + (py - glowCy) ** 2)
          const glowR = r * 0.22
          const glowAA = Math.max(0, Math.min(1, glowR - glowDist + 0.5))
          if (glowAA > 0) setPixel(px, py, 255, 255, 255, Math.round(glowAA * 140))
        }
      }
    }
  }

  return PNG.sync.write(png)
}

// ─── Generador de icono PNG ───────────────────────────────────────────────────
//
// Genera un círculo relleno del color del programa sobre el fondo.
// Usado para icon.png (29×29 / 58×58) y logo.png (50×50 / 100×100).

function generateCirclePNG(size: number, bgHex: string, fgHex: string): Buffer {
  const png = new PNG({ width: size, height: size })
  const bg = hexToRgbTuple(bgHex)
  const fg = hexToRgbTuple(fgHex)
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.42

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = (py * size + px) * 4
      const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
      const aa = Math.max(0, Math.min(1, r - dist + 0.8))
      png.data[idx + 0] = Math.round(bg[0] * (1 - aa) + fg[0] * aa)
      png.data[idx + 1] = Math.round(bg[1] * (1 - aa) + fg[1] * aa)
      png.data[idx + 2] = Math.round(bg[2] * (1 - aa) + fg[2] * aa)
      png.data[idx + 3] = 255
    }
  }

  return PNG.sync.write(png)
}

// ─── Generador principal del .pkpass ─────────────────────────────────────────

export async function generateApplePass(passData: PassData): Promise<Buffer> {
  const { customer, program, serialNumber, authToken, currentStamps, rewardReady } = passData
  const rawAppUrl = process.env.APP_URL || 'http://localhost:3000'
  const appUrl = /^https?:\/\//.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`

  const stampsLabel = rewardReady
    ? '🎉 ¡PREMIO LISTO!'
    : `${currentStamps} / ${program.stampsRequired}`

  // ─── Certificados ──────────────────────────────────────────────────────────
  const wwdr       = loadCert(process.env.APPLE_WWDR_B64,  process.env.APPLE_WWDR_PATH  || './certs/wwdr.pem')
  const signerCert = loadCert(process.env.APPLE_CERT_B64,  process.env.APPLE_CERT_PATH  || './certs/signerCert.pem')
  const signerKey  = loadCert(process.env.APPLE_KEY_B64,   process.env.APPLE_KEY_PATH   || './certs/signerKey.pem')

  const certificates: {
    wwdr: Buffer
    signerCert: Buffer
    signerKey: Buffer
    signerKeyPassphrase?: string
  } = { wwdr, signerCert, signerKey }
  if (process.env.APPLE_KEY_PASSPHRASE) {
    certificates.signerKeyPassphrase = process.env.APPLE_KEY_PASSPHRASE
  }

  // ─── Imágenes ──────────────────────────────────────────────────────────────
  // icon: 29×29 / 58×58 (requerido por Apple Wallet para notificaciones)
  // logo: 50×50 / 100×100 (esquina superior izquierda del pase)
  // Si el negocio tiene un logo PNG en /public, se usa; si no, generamos un círculo de color.

  let iconBuffer: Buffer
  if (program.stampIconUrl && program.stampIconUrl.startsWith('/')) {
    const iconPath = path.resolve(process.cwd(), 'public', program.stampIconUrl.slice(1))
    iconBuffer = fs.existsSync(iconPath)
      ? fs.readFileSync(iconPath)
      : generateCirclePNG(29, program.backgroundColor, program.foregroundColor)
  } else {
    iconBuffer = generateCirclePNG(29, program.backgroundColor, program.foregroundColor)
  }

  const icon2xBuffer = generateCirclePNG(58,  program.backgroundColor, program.foregroundColor)
  const logoBuffer   = generateCirclePNG(50,  program.backgroundColor, program.foregroundColor)
  const logo2xBuffer = generateCirclePNG(100, program.backgroundColor, program.foregroundColor)

  const stripBuffer   = generateStripPNG(currentStamps, program.stampsRequired, program.backgroundColor, program.foregroundColor, 320, 100)
  const strip2xBuffer = generateStripPNG(currentStamps, program.stampsRequired, program.backgroundColor, program.foregroundColor, 640, 200)

  // ─── Construcción del pase ─────────────────────────────────────────────────
  // PKPass v3.x API: new PKPass(buffers, certificates, overridableProps)
  // pass.json se genera internamente; NO incluirlo en buffers.

  const pass = new PKPass(
    {
      'icon.png':     iconBuffer,
      'icon@2x.png':  icon2xBuffer,
      'logo.png':     logoBuffer,
      'logo@2x.png':  logo2xBuffer,
      'strip.png':    stripBuffer,
      'strip@2x.png': strip2xBuffer,
    },
    certificates,
    {
      formatVersion:          1,
      passTypeIdentifier:     process.env.APPLE_PASS_TYPE_IDENTIFIER,
      serialNumber,
      teamIdentifier:         process.env.APPLE_TEAM_IDENTIFIER,
      webServiceURL:          `${appUrl}/api/passes/apple`,
      authenticationToken:    authToken,
      organizationName:       program.business.name,
      description:            program.name,
      backgroundColor:        hexToRgb(program.backgroundColor),
      foregroundColor:        hexToRgb(program.foregroundColor),
      labelColor:             hexToRgb(program.labelColor),
      logoText:               program.business.name,
    } as any,
  )

  // Tipo de pase — obligatorio antes de agregar campos
  pass.type = 'storeCard'

  // Campos principales
  pass.primaryFields.push({
    key:           'stamps',
    label:         rewardReady ? 'PREMIO DISPONIBLE' : 'SELLOS',
    value:         stampsLabel,
    textAlignment: 'PKTextAlignmentCenter',
  })

  pass.secondaryFields.push(
    { key: 'reward',   label: 'PREMIO',     value: program.rewardDescription },
    { key: 'required', label: 'COMPLETAR',  value: `${program.stampsRequired} sellos` },
  )

  pass.auxiliaryFields.push({
    key:   'holder',
    label: 'TITULAR',
    value: customer.name,
  })

  pass.backFields.push(
    { key: 'fullName',     label: 'Nombre',              value: customer.name },
    { key: 'email',        label: 'Email',                value: customer.email },
    { key: 'programDesc',  label: 'Programa',             value: program.description || program.name },
    { key: 'rewardDetail', label: 'Premio al completar',  value: program.rewardDescription },
    {
      key:   'terms',
      label: 'Condiciones',
      value: `Acumula ${program.stampsRequired} sellos para obtener tu premio. No transferible.`,
    },
  )

  // Código QR — solo QR para tarjeta de fidelización
  pass.setBarcodes({
    format:          'PKBarcodeFormatQR',
    message:         serialNumber,
    messageEncoding: 'iso-8859-1',
    altText:         `ID: ${serialNumber.slice(0, 8)}`,
  })

  return pass.getAsBuffer()
}
