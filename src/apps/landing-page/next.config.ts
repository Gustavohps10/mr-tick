import { createMDX } from 'fumadocs-mdx/next'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
const withMDX = createMDX()

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
    rootParams: true,
    globalNotFound: true,
  },

  reactCompiler: true,

  transpilePackages: ['@mr-tick/ui', '@mr-tick/application'],

  async rewrites() {
    return [
      {
        source: '/docs.md',
        destination: '/api/docs/markdown/en',
      },
      {
        source: '/docs/:slug*.md',
        destination: '/api/docs/markdown/en/:slug*',
      },
      {
        source: '/pt-br/docs.md',
        destination: '/api/docs/markdown/pt-br',
      },
      {
        source: '/pt-br/docs/:slug*.md',
        destination: '/api/docs/markdown/pt-br/:slug*',
      },
    ]
  },

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
