// In-memory login rate limiter — per email, single-process (Docker single instance).
// 5 failed attempts within 15 min → 15-minute lockout. Resets on successful login.

const MAX_ATTEMPTS = 5
const WINDOW_MS    = 15 * 60 * 1000  // 15 min sliding window
const LOCKOUT_MS   = 15 * 60 * 1000  // 15 min lockout after MAX_ATTEMPTS

interface Bucket {
  count:   number
  resetAt: number  // epoch ms when the window/lockout expires
}

const store = new Map<string, Bucket>()

export function checkLoginRateLimit(email: string): { limited: boolean; minutesLeft: number } {
  const key    = email.toLowerCase().trim()
  const now    = Date.now()
  const bucket = store.get(key)

  if (!bucket || now >= bucket.resetAt) return { limited: false, minutesLeft: 0 }
  if (bucket.count < MAX_ATTEMPTS)      return { limited: false, minutesLeft: 0 }

  const minutesLeft = Math.ceil((bucket.resetAt - now) / 60_000)
  return { limited: true, minutesLeft }
}

export function recordLoginFailure(email: string): void {
  const key    = email.toLowerCase().trim()
  const now    = Date.now()
  const bucket = store.get(key)

  if (!bucket || now >= bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }

  bucket.count++
  if (bucket.count >= MAX_ATTEMPTS) {
    // Start the lockout clock from the moment the threshold is crossed
    bucket.resetAt = now + LOCKOUT_MS
  }
}

export function resetLoginAttempts(email: string): void {
  store.delete(email.toLowerCase().trim())
}
