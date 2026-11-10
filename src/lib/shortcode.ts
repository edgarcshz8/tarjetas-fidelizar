import { prisma } from '@/lib/prisma'

// Charset without ambiguous chars: 0/O, 1/I/L
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 10

function randomCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return code
}

export async function generateUniquePassCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode()
    const existing = await prisma.customerPass.findUnique({ where: { serialNumber: code } })
    if (!existing) return code
  }
  throw new Error('No se pudo generar un código único para el pase')
}
