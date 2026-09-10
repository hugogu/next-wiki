import { agentMemorySourceDocumentDeactivateInputSchema, agentMemorySourceDocumentInputSchema } from '@next-wiki/shared';
import { assertSupportedProvider } from '../../_shared';
import { parsePublicJson, publicJson, withPublicApi } from '../../../_shared/route';
import { deactivateSourceDocument, upsertSourceDocument } from '@/server/services/agent-memory-documents';

/**
 * @openapi
 * @summary Mirror one Memory Wiki Markdown document
 * @description Stores a complete current-file snapshot in the bound Raw space. Replaying the same digest is unchanged; updates create an immutable revision.
 * @tag Agent Memory Wiki
 * @auth bearer
 * @body AgentMemorySourceDocumentInput
 * @response AgentMemorySourceDocument
 */
export const PUT = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  const parsed = await parsePublicJson(request, agentMemorySourceDocumentInputSchema);
  if (!parsed.ok) return parsed.response;
  const result = await upsertSourceDocument(ctx, parsed.data);
  return publicJson(result, { status: result.outcome === 'created' ? 201 : 200 });
});

/**
 * @openapi
 * @summary Retire one disappeared source document
 * @description Stops Agent retrieval of a source document while retaining its restricted Raw page and immutable revision history for audit.
 * @tag Agent Memory Wiki
 * @auth bearer
 * @body AgentMemorySourceDocumentDeactivateInput
 * @response AgentMemorySourceDocumentDeactivate
 */
export const DELETE = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  const parsed = await parsePublicJson(request, agentMemorySourceDocumentDeactivateInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await deactivateSourceDocument(ctx, parsed.data));
});
