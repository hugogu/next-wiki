import { z } from 'zod';
import {
  contentSpaceSchema,
  pathSchema,
  publicContentNatureSchema,
  publicRawInputKindSchema,
  publicRawSourceSchema,
  type WikiApiClient,
} from '../api-client';
import { createPageResponse } from '../shapes';

export const createPageSchema = {
  path: pathSchema.describe('Tree path (organizational location), e.g. docs/getting-started'),
  // 035: the canonical public address. Defaults to `path` when omitted.
  slug: pathSchema.optional().describe('Canonical public address. Defaults to path when omitted.'),
  title: z.string().min(1).max(200).describe('Page title'),
  contentSource: z.string().default('').describe('Markdown source content; required for raw entries.'),
  locale: z.string().min(1).max(20).optional().describe('Locale; defaults to wiki default'),
  space: contentSpaceSchema.optional().describe(
    "Target space. MCP defaults to 'generated' for AI-authored pages. Pass an explicit value to override it."
  ),
  nature: publicContentNatureSchema.optional().describe('Stable content nature; raw pages use a forced original value.'),
  inputKind: publicRawInputKindSchema.optional().describe('Required when creating a raw entry'),
  source: publicRawSourceSchema.optional().describe('Immutable source metadata for a raw entry'),
  contentType: z.string().optional().describe('Raw entry MIME type (RFC 2046). Required when the body is not markdown; defaults to text/markdown. Raw bodies are stored verbatim (no OKF frontmatter).'),
  originalBytes: z.string().optional().describe('Optional base64 raw payload (PDF, HTML, JSON, image, log) stored as the immutable original bytes alongside the extracted text.'),
  categoryId: z.string().uuid().optional().describe('Raw taxonomy category id (see list_raw_categories). Applied from the default when omitted; required if no default is configured.'),
};
export type CreatePageInput = z.infer<z.ZodObject<typeof createPageSchema>>;

export async function createPage(client: WikiApiClient, args: CreatePageInput) {
  // MCP is the AI boundary. New AI-authored pages default to generated; callers
  // may select another active space explicitly.
  const space = args.space ?? 'generated';
  const response = await client.createPage({
    path: args.path,
    slug: args.slug,
    title: args.title,
    contentSource: args.contentSource,
    locale: args.locale,
    space,
    nature: args.nature,
    inputKind: args.inputKind,
    source: args.source,
    contentType: args.contentType,
    originalBytes: args.originalBytes,
    categoryId: args.categoryId,
  });
  return createPageResponse(response);
}
