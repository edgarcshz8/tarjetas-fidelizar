import { isBirthdayToday, todayInTimezone, renderBirthdayMessage, DEFAULT_BIRTHDAY_TITLE, DEFAULT_BIRTHDAY_MESSAGE } from '@/lib/birthday'
import { PKPass } from 'passkit-generator'
import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { LoyaltyProgram, CustomerPass, Customer } from '@prisma/client'

export type PassData = CustomerPass & {
  customer: Customer
  program: LoyaltyProgram & {
    business: {
      name: string
      slug: string
      latitude?: number | null
      longitude?: number | null
      locationName?: string | null
    }
  }
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

// ─── Twemoji emoji image loader ──────────────────────────────────────────────
//
// Converts an emoji string to its Twemoji CDN PNG and caches it.
// This completely bypasses font rendering — no font files needed.

type LoadedImage = Awaited<ReturnType<typeof loadImage>>
const _emojiCache = new Map<string, LoadedImage | null>()

function emojiToTwemojiCodepoint(emoji: string): string {
  // Convert emoji to its Unicode codepoints in the format Twemoji uses.
  // Uses ZWJ sequences as-is, strips VS16 (0xFE0F) which Twemoji omits.
  const codepoints = [...emoji]
    .map(c => c.codePointAt(0)!)
    .filter(cp => cp !== 0xFE0F)
  return codepoints.map(cp => cp.toString(16)).join('-')
}

async function fetchEmojiImage(emoji: string): Promise<LoadedImage | null> {
  if (_emojiCache.has(emoji)) return _emojiCache.get(emoji)!

  const cp = emojiToTwemojiCodepoint(emoji)
  const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp}.png`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) {
      console.warn(`[passkit] twemoji fetch ${res.status} for ${emoji} (${cp})`)
      _emojiCache.set(emoji, null)
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const img = await loadImage(buf)
    _emojiCache.set(emoji, img)
    return img
  } catch (e) {
    console.error('[passkit] twemoji fetch error:', e)
    _emojiCache.set(emoji, null)
    return null
  }
}

// ─── Generador de strip PNG ──────────────────────────────────────────────────
//
// Dibuja N sellos (círculo relleno + emoji) en 1 o 2 filas.
//   · Ganados    → círculo relleno (foregroundColor) + emoji a tamaño completo
//   · Pendientes → anillo semi-transparente + emoji muy tenue

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgbTuple(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

export async function generateStripPNG(
  current: number,
  total: number,
  bgHex: string,
  fgHex: string,
  w: number,
  h: number,
  stampEmoji: string = '⭐',
): Promise<Buffer> {
  // Pre-fetch the emoji image before drawing
  const emojiImg = await fetchEmojiImage(stampEmoji)

  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = bgHex
  ctx.fillRect(0, 0, w, h)

  const n         = total
  const singleRow = n <= 5
  const perRow1   = singleRow ? n : Math.ceil(n / 2)
  const perRow2   = singleRow ? 0 : Math.floor(n / 2)

  const r   = singleRow
    ? Math.min(h * 0.38, (w * 0.94) / (n * 2.1))
    : Math.min(h * 0.19, (w * 0.94) / (perRow1 * 2.1))
  const gap = r * 0.10
  const cy1 = singleRow ? h * 0.50 : h * 0.28
  const cy2 = h * 0.72

  const emojiSize = Math.round(r * 1.3)
  const ringColor = hexToRgba(fgHex, 0.45)
  const ringWidth = Math.max(1.5, r * 0.13)

  function drawStamp(cx: number, cy: number, earned: boolean) {
    ctx.save()

    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)

    if (earned) {
      ctx.fillStyle = fgHex
      ctx.fill()
    } else {
      ctx.strokeStyle = ringColor
      ctx.lineWidth = ringWidth
      ctx.stroke()
    }

    // Clip emoji to circle bounds
    ctx.clip()

    if (emojiImg) {
      ctx.globalAlpha = earned ? 1.0 : 0.40
      const half = emojiSize / 2
      ctx.drawImage(emojiImg, cx - half, cy - half, emojiSize, emojiSize)
    }

    ctx.restore()
  }

  const totalW1 = perRow1 * 2 * r + (perRow1 - 1) * gap
  const startX1 = (w - totalW1) / 2 + r
  for (let i = 0; i < perRow1; i++) {
    drawStamp(startX1 + i * (2 * r + gap), cy1, i < current)
  }

  if (perRow2 > 0) {
    const totalW2 = perRow2 * 2 * r + (perRow2 - 1) * gap
    const startX2 = (w - totalW2) / 2 + r
    for (let i = 0; i < perRow2; i++) {
      drawStamp(startX2 + i * (2 * r + gap), cy2, (perRow1 + i) < current)
    }
  }

  return canvas.toBuffer('image/png')
}

// ─── Generador de icono PNG ───────────────────────────────────────────────────

function generateCirclePNG(size: number, bgHex: string, fgHex: string): Buffer {
  const png = new PNG({ width: size, height: size })
  const bg = hexToRgbTuple(bgHex)
  const fg = hexToRgbTuple(fgHex)
  const cx = size / 2
  const cy = size / 2
  const rr = size * 0.42

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = (py * size + px) * 4
      const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
      const aa = Math.max(0, Math.min(1, rr - dist + 0.8))
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
  const logoSrc = await loadLogoBuffer(
    program.stampIconUrl,
    program.backgroundColor,
    program.foregroundColor,
    100,
  )

  const iconBuffer   = logoSrc
  const icon2xBuffer = logoSrc
  const logoBuffer   = logoSrc
  const logo2xBuffer = logoSrc

  // Strip @1x 375×144 / @2x 750×288 / @3x 1125×432
  const emoji = program.stampEmoji ?? '⭐'
  const stripBuffer   = await generateStripPNG(currentStamps, program.stampsRequired, program.backgroundColor, program.foregroundColor,  375, 144, emoji)
  const strip2xBuffer = await generateStripPNG(currentStamps, program.stampsRequired, program.backgroundColor, program.foregroundColor,  750, 288, emoji)
  const strip3xBuffer = await generateStripPNG(currentStamps, program.stampsRequired, program.backgroundColor, program.foregroundColor, 1125, 432, emoji)

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

  // ─── Mensaje de cumpleaños ─────────────────────────────────────────────────
  // El campo existe siempre; el día del cumpleaños cambia su valor y lleva changeMessage,
  // así iOS muestra la notificación en pantalla de bloqueo cuando el pase se actualiza.
  // Fuera del cumpleaños no lleva changeMessage, para que volver al texto normal no notifique.
  //
  // El mensaje aparece solo después de que el job de cumpleaños marcó el pase hoy
  // (birthdayNotifiedOn empieza con la fecha de hoy). Así un pase creado el mismo día
  // nace con el texto normal y el job lo cambia → iOS detecta el cambio y notifica.
  // En modo prueba (?force=1) birthdayNotifiedOn = "YYYY-MM-DDTHH:MM:SS": se agrega la hora
  // al texto para que cada ejecución cambie el pase y vuelva a notificar.
  const firstName  = customer.name.trim().split(/\s+/)[0] || customer.name
  const notifiedOn = passData.birthdayNotifiedOn ?? ''
  if (isBirthdayToday(customer.birthDate) && notifiedOn.startsWith(todayInTimezone().iso)) {
    const testSuffix = notifiedOn.includes('T') ? ` (prueba ${notifiedOn.split('T')[1]})` : ''
    const vars = { cliente: firstName, negocio: program.business.name, premio: program.rewardDescription }
    const bdTitle   = renderBirthdayMessage(program.birthdayTitle   || DEFAULT_BIRTHDAY_TITLE,   vars)
    const bdMessage = renderBirthdayMessage(program.birthdayMessage || DEFAULT_BIRTHDAY_MESSAGE, vars)
    pass.backFields.push({
      key:           'message',
      label:         'Mensaje',
      value:         `${bdTitle}\n${bdMessage}${testSuffix}`,
      changeMessage: '%@',
    })
  } else {
    pass.backFields.push({
      key:   'message',
      label: 'Mensaje',
      value: `¡Gracias por preferir ${program.business.name}!`,
    })
  }

  pass.setBarcodes({
    format:          'PKBarcodeFormatQR',
    message:         serialNumber,
    messageEncoding: 'iso-8859-1',
    altText:         serialNumber,
  })

  // ─── Geofencing: aparece en pantalla de bloqueo al acercarse al negocio ──────
  const { latitude, longitude, locationName, name: businessName } = passData.program.business
  if (latitude != null && longitude != null) {
    pass.setLocations({
      latitude,
      longitude,
      relevantText: locationName || `¡Visita ${businessName}!`,
    })
    console.log(`[passkit] LOCATIONS SET serial=${serialNumber} lat=${latitude} lng=${longitude} text="${locationName || `¡Visita ${businessName}!`}"`)
  } else {
    console.warn(`[passkit] NO LOCATIONS serial=${serialNumber} — business has no coordinates in DB`)
  }

  // Sin relevantDates: en iOS 18+ una fecha relevante puede hacer que iOS priorice la
  // fecha sobre la ubicación y no sugiera el pase al llegar al negocio. El aviso de
  // cumpleaños ya se envía por push (changeMessage), así que la fecha no es necesaria.

  return pass.getAsBuffer()
}
