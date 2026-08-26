import type { MetadataRoute } from 'next';
import { env } from '@/server/config';

/**
 * `robots` reads `env.APP_URL`, which is only injected at container runtime
 * (docker-compose `environment:`), not during the Docker build's `next build`
 * step. Without opting out of static generation, Next prerenders this route
 * once at build time using the Zod schema's `http://localhost:3000` fallback
 * and bakes that into the image — every deployment then serves a `Sitemap:`
 * directive pointing at localhost, regardless of the real runtime `APP_URL`.
 * Render on demand instead, matching `sitemap.ts`.
 */
export const dynamic = 'force-dynamic';

/**
 * /robots.txt — allow all well-behaved crawlers, advertise the sitemap.
 *
 * We deliberately keep this permissive. Spaces that need to stay private are
 * already protected at the read layer (anonymous requests return 404), so
 * indexing the rest of the site is safe and helps SEO.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = env.APP_URL.replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Public share links (/s/<id>) are for direct access, not indexing;
        // they are noindex and canonicalise to the primary page anyway.
        disallow: '/s/',
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}