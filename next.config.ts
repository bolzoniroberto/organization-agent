import type { NextConfig } from 'next'

const BASE_PATH = '/org-agent'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  reactStrictMode: false,
  basePath: BASE_PATH,
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
}

export default nextConfig
