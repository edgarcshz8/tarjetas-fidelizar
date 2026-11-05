/** @type {import('next').NextConfig} */
const nextConfig = {
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
