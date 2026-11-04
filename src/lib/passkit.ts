import { PKPass } from 'passkit-generator'
import fs from 'fs'
import path from 'path'
import { LoyaltyProgram, CustomerPass, Customer } from '@prisma/client'

export type PassData = CustomerPass & {
  customer: Customer
  program: LoyaltyProgram & { business: { name: string; slug: string } }
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return 'rgb(0,0,0)'
  return `rgb(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)})`
}

function loadCert(envPath: string): Buffer {
  const filePath = path.resolve(process.cwd(), envPath)
  return fs.readFileSync(filePath)
}

export async function generateApplePass(passData: PassData): Promise<Buffer> {
  const { customer, program, serialNumber, authToken, currentStamps, rewardReady } = passData
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  const stampsLabel = rewardReady
    ? '🎉 ¡PREMIO LISTO!'
    : `${currentStamps} / ${program.stampsRequired}`

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER,
    serialNumber,
    teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER,
    webServiceURL: `${appUrl}/api/passes/apple`,
    authenticationToken: authToken,
    organizationName: program.business.name,
    description: program.name,
    backgroundColor: hexToRgb(program.backgroundColor),
    foregroundColor: hexToRgb(program.foregroundColor),
    labelColor: hexToRgb(program.labelColor),
    logoText: program.business.name,
    storeCard: {
      primaryFields: [
        {
          key: 'stamps',
          label: rewardReady ? 'PREMIO DISPONIBLE' : 'SELLOS',
          value: stampsLabel,
          textAlignment: 'PKTextAlignmentCenter',
        },
      ],
      secondaryFields: [
        {
          key: 'reward',
          label: 'PREMIO',
          value: program.rewardDescription,
        },
        {
          key: 'required',
          label: 'SELLOS REQUERIDOS',
          value: String(program.stampsRequired),
        },
      ],
      auxiliaryFields: [
        {
          key: 'holder',
          label: 'TITULAR',
          value: customer.name,
        },
      ],
      backFields: [
        {
          key: 'fullName',
          label: 'Nombre',
          value: customer.name,
        },
        {
          key: 'email',
          label: 'Email',
          value: customer.email,
        },
        {
          key: 'programDesc',
          label: 'Programa',
          value: program.description || program.name,
        },
        {
          key: 'rewardDetail',
          label: 'Premio al completar',
          value: program.rewardDescription,
        },
        {
          key: 'terms',
          label: 'Condiciones',
          value: `Acumula ${program.stampsRequired} sellos para obtener tu premio. No transferible.`,
        },
      ],
    },
    barcodes: [
      {
        message: serialNumber,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
        altText: `ID: ${serialNumber.slice(0, 8)}`,
      },
    ],
    barcode: {
      message: serialNumber,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
    },
  }

  // Cargar certificados desde el sistema de archivos
  const wwdr = loadCert(process.env.APPLE_WWDR_PATH || './certs/wwdr.pem')
  const signerCert = loadCert(process.env.APPLE_CERT_PATH || './certs/signerCert.pem')
  const signerKey = loadCert(process.env.APPLE_KEY_PATH || './certs/signerKey.pem')

  // Icono de sello: usar el del programa o un icono genérico
  let iconBuffer: Buffer
  if (program.stampIconUrl && program.stampIconUrl.startsWith('/')) {
    const iconPath = path.resolve(process.cwd(), 'public', program.stampIconUrl.slice(1))
    if (fs.existsSync(iconPath)) {
      iconBuffer = fs.readFileSync(iconPath)
    } else {
      iconBuffer = getDefaultIcon()
    }
  } else {
    iconBuffer = getDefaultIcon()
  }

  // passkit-generator v3 acepta un objeto de Buffers en runtime, pero sus
  // tipos TS solo declaran string. El cast a any es intencional.
  const pass = await PKPass.from(
    {
      model: {
        'pass.json': Buffer.from(JSON.stringify(passJson)),
        'icon.png': iconBuffer,
        'icon@2x.png': iconBuffer,
        'logo.png': iconBuffer,
        'logo@2x.png': iconBuffer,
      } as any,
      certificates: {
        wwdr,
        signerCert,
        signerKey,
        signerKeyPassphrase: process.env.APPLE_KEY_PASSPHRASE || undefined,
      },
    },
    {}
  )

  return pass.getAsBuffer()
}

// Icono SVG convertido a PNG mínimo (1x1 blanco) como fallback
// En producción, reemplazar con iconos reales de 29x29 y 58x58 px
function getDefaultIcon(): Buffer {
  // PNG mínimo 1x1 blanco (bytes reales)
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
    'base64'
  )
}
