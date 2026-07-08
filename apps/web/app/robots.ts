import type { MetadataRoute } from 'next';
import { env } from '@/server/config';

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
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}