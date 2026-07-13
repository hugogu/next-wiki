import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  typedRoutes: true,
  experimental: {
    turbopackFileSystemCacheForDev: false,
    turbopackMemoryLimit: 4096,
  },
  distDir: process.env.NEXT_WIKI_E2E === 'true' ? '.next-e2e' : '.next',
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
