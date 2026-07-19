import { z } from 'zod';
import {
  contentSpaceSchema,
  pathSchema,
  publicContentNatureSchema,
  publicPageKindSchema,
  publicRawInputKindSchema,
  publicRawSourceSchema,
  type WikiApiClient,
} from '../api-client';
import { createPageResponse } from '../shapes';

export const createPageSchema = {
  path: pathSchema.describe('Canonical page path, e.g. docs/getting-started'),
  title: z.string().min(1).max(200).describe('Page title'),
  contentSource: z.string().default('').describe('Markdown source content; required for raw entries and ignored by link pages'),
  locale: z.string().min(1).max(20).optional().describe('Locale; defaults to wiki default'),
  space: contentSpaceSchema.optional().describe('Target space. API-key writes default to generated in LLM Wiki mode.'),
  nature: publicContentNatureSchema.optional().describe('Stable content nature; raw and link pages use forced values.'),
  inputKind: publicRawInputKindSchema.optional().describe('Required when creating a raw entry'),
  source: publicRawSourceSchema.optional().describe('Immutable source metadata for a raw entry'),
  contentType: z.string().optional().describe('Raw entry MIME type (RFC 2046). Required when the body is not markdown; defaults to text/markdown. Raw bodies are stored verbatim (no OKF frontmatter).'),
  originalBytes: z.string().optional().describe('Optional base64 raw payload (PDF, HTML, JSON, image, log) stored as the immutable original bytes alongside the extracted text.'),
  categoryId: z.string().uuid().optional().describe('Raw taxonomy category id (see list_raw_categories). Applied from the default when omitted; required if no default is configured.'),
  kind: publicPageKindSchema.optional().describe('Use link to publish a generated target through the wiki space'),
  linkTargetPageId: z.string().uuid().optional().describe('Required for kind link; must reference a generated page'),
};
export type CreatePageInput = z.infer<z.ZodObject<typeof createPageSchema>>;

export async function createPage(client: WikiApiClient, args: CreatePageInput) {
  const response = await client.createPage({
    path: args.path,
    title: args.title,
    contentSource: args.contentSource,
    locale: args.locale,
    space: args.space,
    nature: args.nature,
    inputKind: args.inputKind,
    source: args.source,
    contentType: args.contentType,
    originalBytes: args.originalBytes,
    categoryId: args.categoryId,
    kind: args.kind,
    linkTargetPageId: args.linkTargetPageId,
  });
  return createPageResponse(response);
}
