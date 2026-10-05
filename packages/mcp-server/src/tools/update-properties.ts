import { z } from 'zod';
import { localeSchema, pathSchema, type WikiApiClient } from '../api-client';
import { updatePropertiesResponse } from '../shapes';

export const updatePagePropertiesSchema = {
  pageId: z.string().uuid().describe('Page UUID'),
  title: z.string().min(1).max(200).optional().describe('New page title'),
  path: pathSchema.optional().describe('New tree path (organizational location). Does not change the page\'s public address.'),
  // 035: the canonical public address. Distinct from `path` — changing it
  // never moves the page in the tree, only where it is publicly reachable. A
  // published page's former address is retained as a redirect.
  slug: pathSchema.optional().describe('New canonical public address. Distinct from path; a published page\'s former address is retained as a redirect.'),
  locale: localeSchema
    .nullable()
    .optional()
    .describe('Language the page text is written in, as a two-letter ISO 639-1 code (e.g. "en", "zh"). Pass null to clear it: a page does not need a language. Omit to leave it unchanged. Refused if the page already has a translation in that language.'),
  baseRevisionId: z.string().uuid().optional().describe('Stale guard when changing properties after reading page'),
};
export type UpdatePagePropertiesInput = z.infer<z.ZodObject<typeof updatePagePropertiesSchema>>;

export async function updatePageProperties(client: WikiApiClient, args: UpdatePagePropertiesInput) {
  if (!args.title && !args.path && !args.slug && args.locale === undefined) {
    throw new Error('Provide title, path, slug, or locale to update');
  }

  const response = await client.updatePageProperties(args.pageId, {
    title: args.title,
    path: args.path,
    slug: args.slug,
    locale: args.locale,
    baseRevisionId: args.baseRevisionId,
  });
  return updatePropertiesResponse(response);
}
