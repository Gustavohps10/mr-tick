import { createMDX } from 'fumadocs-mdx/next'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
const withMDX = createMDX()

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },

  reactCompiler: true,

  transpilePackages: ['@mr-tick/ui', '@mr-tick/application'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.jsdelivr.net',
        pathname: '/gh/homarr-labs/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'github.com',
      },
    ],
  },
}

export default withNextIntl(withMDX(nextConfig))
