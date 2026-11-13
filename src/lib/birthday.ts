// Utilidades de cumpleaños.
// birthDate se guarda como medianoche UTC del día ingresado ("2006-11-12" → 2006-11-12T00:00Z),
// así que su mes/día se leen en UTC. "Hoy" se calcula en la zona horaria del negocio (Chile),
// porque el servidor corre en UTC y a partir de las 21:00 en Chile ya sería "mañana" en UTC.

export const BIRTHDAY_TIMEZONE = process.env.BIRTHDAY_TIMEZONE || 'America/Santiago'

export const DEFAULT_BIRTHDAY_TITLE   = '🎂 ¡Feliz cumpleaños, {cliente}!'
export const DEFAULT_BIRTHDAY_MESSAGE = '{negocio} te desea un gran día.'

// Reemplaza {cliente}, {negocio} y {premio} en la plantilla. Texto no reconocido se deja intacto.
// {nombre} se acepta como sinónimo de {cliente} por compatibilidad con mensajes guardados previamente.
export function renderBirthdayMessage(
  template: string | null | undefined,
  vars: { cliente: string; negocio: string; premio: string },
): string {
  return (template ?? DEFAULT_BIRTHDAY_MESSAGE)
    .replace(/{cliente}/g, vars.cliente)
    .replace(/{nombre}/g,  vars.cliente)
    .replace(/{negocio}/g, vars.negocio)
    .replace(/{premio}/g,  vars.premio)
}

export function todayInTimezone(timeZone: string = BIRTHDAY_TIMEZONE, now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  const year = get('year')
  const month = get('month')
  const day = get('day')
  return {
    year,
    month,
    day,
    iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  }
}

export function isBirthdayToday(birthDate: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!birthDate) return false
  const bd = new Date(birthDate)
  const today = todayInTimezone(BIRTHDAY_TIMEZONE, now)
  return bd.getUTCMonth() + 1 === today.month && bd.getUTCDate() === today.day
}
