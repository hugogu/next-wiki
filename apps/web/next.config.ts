import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  experimental: {
    turbopackFileSystemCacheForDev: false,
    turbopackMemoryLimit: 4096,
  },
  distDir: process.env.NEXT_WIKI_E2E === 'true' ? '.next-e2e' : '.next',
};

export default nextConfig;
