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
    // Requerido para passkit-generator (usa Node.js built-ins como crypto y fs)
    serverComponentsExternalPackages: ['passkit-generator'],
  },
}

module.exports = nextConfig
