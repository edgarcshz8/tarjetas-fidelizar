/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable built-in gzip compression — binary API routes (pkpass, images) must
  // not be gzip-wrapped, otherwise iOS Wallet receives a double-compressed ZIP.
  compress: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',        value: 'DENY' },
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
          {
            key:   'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; frame-ancestors 'none'",
          },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: [
      'passkit-generator',
      '@parse/node-apn',
      'pngjs',
      '@napi-rs/canvas',
    ],
  },
}

module.exports = nextConfig
