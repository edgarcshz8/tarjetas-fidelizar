// In-memory rate limiter — single-process (Docker single instance).

interface Bucket {
  count:   number
  resetAt: number  // epoch ms when the window expires
}

const store = new Map<string, Bucket>()

// Generic sliding-window rate limiter. key should encode the resource + principal
// (e.g. "reg-biz:1.2.3.4"). Returns { allowed } — does NOT auto-record the hit;
// call store.get() / store.set() if you need custom logic, or just call this and
// rely on the counter inside.
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean } {
  const now    = Date.now()
  const bucket = store.get(key)

  if (!bucket || now >= bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  if (bucket.count < limit) {
    bucket.count++
    return { allowed: true }
  }

  return { allowed: false }
}

// ─── Login-specific helpers ───────────────────────────────────────────────────
// 5 failed attempts within 15 min → 15-minute lockout. Resets on successful login.

const MAX_ATTEMPTS = 5
const WINDOW_MS    = 15 * 60 * 1000  // 15 min sliding window
const LOCKOUT_MS   = 15 * 60 * 1000  // 15 min lockout after MAX_ATTEMPTS

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
