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
  if (b64Value) return Buffer.from(b64Value, 'base64')
  return fs.readFileSync(path.resolve(process.cwd(), filePath))
}

// Fetches the logo/icon PNG from a URL or local path.
// Falls back to a generated circle if unavailable.
async function loadLogoBuffer(
  stampIconUrl: string | null | undefined,
  bgHex: string,
  fgHex: string,
  fallbackSize: number,
): Promise<Buffer> {
  if (stampIconUrl) {
    if (stampIconUrl.startsWith('http')) {
      try {
        const res = await fetch(stampIconUrl, { signal: AbortSignal.timeout(4000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      } catch {
        // fall through to generated circle
      }
    } else if (stampIconUrl.startsWith('/')) {
      const p = path.resolve(process.cwd(), 'public', stampIconUrl.slice(1))
      if (fs.existsSync(p)) return fs.readFileSync(p)
    }
  }
  return generateCirclePNG(fallbackSize, bgHex, fgHex)
}

// ─── Generador de strip PNG ──────────────────────────────────────────────────
//
// Dibuja N sellos en fila en el TERCIO SUPERIOR del strip.
// Apple Wallet renderiza el texto del primaryField en la parte INFERIOR del strip.
//
//   · Ganados    → círculo relleno (foregroundColor) con silueta de taza en bgColor
//   · Pendientes → anillo vacío semi-transparente con silueta de taza muy tenue

// Returns true if (px, py) falls inside the coffee-cup silhouette centered at
// (cx, cy_c) with stamp radius R. The cup is composed of:
//   – trapezoid body (wider at top, narrower at bottom)
//   – elliptical ring handle on the right side
function inCoffeeCup(px: number, py: number, cx: number, cy_c: number, R: number): boolean {
  // ── Cup body ──
  const topY = cy_c - R * 0.42
  const botY = cy_c + R * 0.54
  if (py >= topY && py <= botY) {
    const t = (py - topY) / (botY - topY)
    const halfW = R * (0.52 - t * 0.15) // 0.52R at top → 0.37R at bottom
    if (Math.abs(px - cx) <= halfW) return true
  }

  // ── Handle (elliptical ring, right side only) ──
  const hcx = cx + R * 0.65
  const hcy = cy_c + R * 0.06
  const outerD = ((px - hcx) / (R * 0.21)) ** 2 + ((py - hcy) / (R * 0.26)) ** 2
  const innerD = ((px - hcx) / (R * 0.09)) ** 2 + ((py - hcy) / (R * 0.13)) ** 2
  if (outerD <= 1.0 && innerD >= 1.0 && px >= cx + R * 0.37) return true

  return false
}

export function generateStripPNG(
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
  const perRow1 = Math.ceil(n / 2)   // fila superior (toma el extra si n es impar)
  const perRow2 = Math.floor(n / 2)  // fila inferior

  // Dos filas usando todo el alto del strip (sin primaryField superpuesto).
  // Filas centradas al 28 % y 72 % — margen simétrico de ~12 % arriba y abajo.
  const r    = Math.min(h * 0.19, (w * 0.94) / (perRow1 * 2.1))
  const gap  = r * 0.10
  const cy1  = h * 0.28
  const cy2  = h * 0.72

  function setPixel(px: number, py: number, cr: number, cg: number, cb: number, alpha: number) {
    if (px < 0 || px >= w || py < 0 || py >= h) return
    const idx = (Math.round(py) * w + Math.round(px)) * 4
    const a = alpha / 255
    png.data[idx + 0] = Math.round(bg[0] * (1 - a) + cr * a)
    png.data[idx + 1] = Math.round(bg[1] * (1 - a) + cg * a)
    png.data[idx + 2] = Math.round(bg[2] * (1 - a) + cb * a)
    png.data[idx + 3] = 255
  }

  function drawCup(cx: number, cy: number, earned: boolean) {
    const strokeW = Math.max(1.5, r * 0.13)
    const x0 = Math.floor(cx - r - 1)
    const x1 = Math.ceil(cx + r + r * 0.2 + 1)
    const y0 = Math.floor(cy - r - 1)
    const y1 = Math.ceil(cy + r + 1)

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dist     = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
        const inCircle = dist <= r + 1
        const circleAA = Math.max(0, Math.min(1, r - dist + 0.8))
        const inCup    = inCoffeeCup(px, py, cx, cy, r)

        if (earned) {
          if (circleAA > 0) {
            if (inCup) {
              setPixel(px, py, bg[0], bg[1], bg[2], Math.round(circleAA * 195))
            } else {
              setPixel(px, py, fg[0], fg[1], fg[2], Math.round(circleAA * 255))
            }
          }
          if (inCircle && !inCup) {
            const glowCx   = cx - r * 0.28
            const glowCy   = cy - r * 0.28
            const glowDist = Math.sqrt((px - glowCx) ** 2 + (py - glowCy) ** 2)
            const glowAA   = Math.max(0, Math.min(1, r * 0.22 - glowDist + 0.5))
            if (glowAA > 0) setPixel(px, py, 255, 255, 255, Math.round(glowAA * 100))
          }
        } else {
          const inner   = r - strokeW
          const outerAA = Math.max(0, Math.min(1, r - dist + 0.8))
          const innerAA = Math.max(0, Math.min(1, dist - inner + 0.8))
          const ringAA  = Math.min(outerAA, innerAA)
          if (ringAA > 0) setPixel(px, py, fg[0], fg[1], fg[2], Math.round(ringAA * 115))
          if (inCircle && inCup && dist < inner) setPixel(px, py, fg[0], fg[1], fg[2], 28)
        }
      }
    }
  }

  const totalW1 = perRow1 * 2 * r + (perRow1 - 1) * gap
  const startX1 = (w - totalW1) / 2 + r

  for (let i = 0; i < perRow1; i++) {
    drawCup(startX1 + i * (2 * r + gap), cy1, i < current)
  }

  if (perRow2 > 0) {
    const totalW2 = perRow2 * 2 * r + (perRow2 - 1) * gap
    const startX2 = (w - totalW2) / 2 + r
    for (let i = 0; i < perRow2; i++) {
      drawCup(startX2 + i * (2 * r + gap), cy2, (perRow1 + i) < current)
    }
  }

  return PNG.sync.write(png)
}

// ─── Generador de icono PNG ───────────────────────────────────────────────────

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
  // icon: 29×29 / 58×58  — notificaciones y listado de pases
  // logo: 50×50 / 100×100 — esquina superior izquierda del pase
  //
  // Si stampIconUrl es una URL HTTP, se descarga; si es ruta local (/...), se lee del disco.
  // Mismo buffer para icon y logo — Apple los recorta en círculo automáticamente.

  const logoSrc = await loadLogoBuffer(
    program.stampIconUrl,
    program.backgroundColor,
    program.foregroundColor,
    100,
  )

  // icon.png must be small (29px); if the fetched image is large it's fine — Apple rescales.
  const iconBuffer   = logoSrc
  const icon2xBuffer = logoSrc
  const logoBuffer   = logoSrc
  const logo2xBuffer = logoSrc

  // Strip @1x 375×144 / @2x 750×288 / @3x 1125×432
  const stripBuffer   = generateStripPNG(currentStamps, program.stampsRequired, program.backgroundColor, program.foregroundColor,  375, 144)
  const strip2xBuffer = generateStripPNG(currentStamps, program.stampsRequired, program.backgroundColor, program.foregroundColor,  750, 288)
  const strip3xBuffer = generateStripPNG(currentStamps, program.stampsRequired, program.backgroundColor, program.foregroundColor, 1125, 432)

  // ─── Construcción del pase ─────────────────────────────────────────────────

  const pass = new PKPass(
    {
      'icon.png':     iconBuffer,
      'icon@2x.png':  icon2xBuffer,
      'logo.png':     logoBuffer,
      'logo@2x.png':  logo2xBuffer,
      'strip.png':    stripBuffer,
      'strip@2x.png': strip2xBuffer,
      'strip@3x.png': strip3xBuffer,
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

  pass.type = 'storeCard'

  // No primaryField — keeping the strip free of Apple's large-text overlay so both
  // stamp rows are fully visible. The counter moves to the first secondaryField.
  pass.secondaryFields.push(
    {
      key:           'stamps',
      label:         rewardReady ? 'PREMIO LISTO' : 'SELLOS',
      value:         rewardReady ? '🎉 ¡PREMIO!' : `${currentStamps} / ${program.stampsRequired}`,
      changeMessage: rewardReady ? '🎉 ¡Premio listo!' : 'Nuevo sello: %@',
    },
    { key: 'holder',   label: 'TITULAR',   value: customer.name },
    { key: 'required', label: 'COMPLETAR', value: `${program.stampsRequired} sellos` },
  )

  // auxiliaryFields: second row — prize description.
  pass.auxiliaryFields.push(
    { key: 'reward', label: 'PREMIO', value: program.rewardDescription },
  )

  pass.backFields.push(
    { key: 'fullName',     label: 'Nombre',             value: customer.name },
    { key: 'email',        label: 'Email',               value: customer.email },
    { key: 'programDesc',  label: 'Programa',            value: program.description || program.name },
    { key: 'rewardDetail', label: 'Premio al completar', value: program.rewardDescription },
    {
      key:   'terms',
      label: 'Condiciones',
      value: `Acumula ${program.stampsRequired} sellos para obtener tu premio. No transferible.`,
    },
  )

  pass.setBarcodes({
    format:          'PKBarcodeFormatQR',
    message:         serialNumber,
    messageEncoding: 'iso-8859-1',
    altText:         `ID: ${serialNumber.slice(0, 8)}`,
  })

  return pass.getAsBuffer()
}
