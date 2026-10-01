import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import {
  READER_REWRITE_SOURCE,
  REGISTERED_READER_PREFIX,
  SESSION_COOKIE,
} from './src/lib/routing';

/**
 * Byte budget for rendered reader pages and `unstable_cache` data, held in
 * memory only (see `isrFlushToDisk` below). A cached reader page weighs roughly
 * 0.4 MB even when it is a 404, so this holds a few hundred of them; the hot
 * set stays resident and the long tail is simply re-rendered on demand.
 */
const ISR_MEMORY_CACHE_MAX_BYTES = 128 * 1024 * 1024;

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
  // Reader pages are ISR, and Next persists every distinct anonymous URL — real
  // pages and 404s alike — as about ten files (~0.5 MB) under `.next/server/app`
  // that it never evicts. Crawlers and mistyped links make that key space
  // unbounded: two weeks of public traffic filled a container's writable layer
  // with 14 GB. Keeping rendered output only in this size-capped LRU bounds
  // both disk and memory; an evicted or restarted entry is regenerated on its
  // next request, so nothing relies on the disk copy.
  cacheMaxMemorySize: ISR_MEMORY_CACHE_MAX_BYTES,
  experimental: {
    isrFlushToDisk: false,
    turbopackFileSystemCacheForDev: false,
    turbopackMemoryLimit: 4096,
  },
  distDir: process.env.NEXT_WIKI_E2E === 'true' ? '.next-e2e' : '.next',
  async rewrites() {
    return {
      beforeFiles: [
        // Anyone carrying a session cookie reads through the dynamic reader
        // instead of the anonymous ISR document. Matching on the cookie alone
        // (rather than a resolved session) keeps this a pure routing rule that
        // applies to every request shape — document loads, RSC navigations and
        // router prefetches alike. A stale cookie costs that visitor the ISR
        // hit; the dynamic route still resolves them as anonymous.
        {
          source: READER_REWRITE_SOURCE,
          has: [{ type: 'cookie', key: SESSION_COOKIE }],
          destination: `${REGISTERED_READER_PREFIX}/:readerPath`,
        },
      ],
      afterFiles: [
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
      ],
      fallback: [],
    };
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
