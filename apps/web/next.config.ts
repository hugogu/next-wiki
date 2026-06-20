import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  distDir: process.env.NEXT_WIKI_E2E === 'true' ? '.next-e2e' : '.next',
};

export default nextConfig;
