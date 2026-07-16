import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  typedRoutes: true,
  // The Feishu SDK owns a persistent WebSocket connection and loads `ws` via
  // CommonJS at runtime. Bundling it into a Next server chunk can corrupt the
  // buffer-util `mask` export used while framing outgoing WebSocket messages.
  // Keep the SDK and its transitive `ws` dependency as Node runtime modules.
  serverExternalPackages: ['@larksuiteoapi/node-sdk'],
  experimental: {
    turbopackFileSystemCacheForDev: false,
    turbopackMemoryLimit: 4096,
  },
  distDir: process.env.NEXT_WIKI_E2E === 'true' ? '.next-e2e' : '.next',
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
