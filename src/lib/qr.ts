import QRCode from 'qrcode'

export async function generateQRDataURL(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })
}

export async function generateQRSVG(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
  })
}
