// Validates that a URL is safe to fetch server-side — rejects loopback,
// link-local, and RFC1918 private ranges to prevent SSRF.
export function isSafeURL(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false
    if (
      /^(localhost|127\.|::1|0\.0\.0\.0|169\.254\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i
        .test(hostname)
    )
      return false
    return true
  } catch {
    return false
  }
}
