/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable built-in gzip compression — binary API routes (pkpass, images) must
  // not be gzip-wrapped, otherwise iOS Wallet receives a double-compressed ZIP.
  compress: false,
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
    ],
  },
}

module.exports = nextConfig
