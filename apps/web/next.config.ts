import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  // Docker copies Next's traced standalone output to the runtime image. This
  // keeps development tooling and unreferenced workspace dependencies out of
  // the production image while retaining every module the server needs.
  output: 'standalone',
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
  async rewrites() {
    return [
      // Raw Markdown export for private content spaces (generated/raw).
      // Must precede the public wiki rewrite so /spaces/... is handled here.
      {
        source: '/spaces/:space/:path*.md',
        destination: '/api/raw-md/spaces/:space/:path*',
      },
      // Raw Markdown export for public wiki pages (including /{locale}/...).
      {
        source: '/:path*.md',
        destination: '/api/raw-md/:path*',
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
