import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import type { BridgeConfig } from './config';
import { ApiClientError, WikiApiClient } from './api-client';

const MAX_QUERY_CHARS = 4_000;
const MAX_ENRICHMENT_RECORDS = 3;

function escapeForModel(value: string): string {
  return value.replace(/[<>&]/gu, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char] ?? char);
}

/**
 * Registers optional automatic prompt enrichment through `agent_turn_prepare`
 * — the SDK's own `PROMPT_INJECTION_HOOK_NAMES` list confirms this is an
 * authorized prompt-mutation hook, and it runs once per turn (later than the
 * session-level `before_agent_start`), matching the bridge contract's
 * "second-phase prompt hook" requirement. Requires the operator to opt in
 * separately from tools; missing session correlation causes a safe skip,
 * never a guessed principal.
 */
export function registerPromptEnrichment(api: OpenClawPluginApi, config: BridgeConfig, client: WikiApiClient): void {
  if (!config.promptEnrichment.enabled) return;

  api.on('agent_turn_prepare', async (event, ctx) => {
    if (!ctx.sessionId) {
      api.logger.debug?.('agent memory bridge: skipped prompt enrichment (no session correlation)');
      return undefined;
    }
    const query = typeof event.prompt === 'string' ? event.prompt.trim().slice(0, MAX_QUERY_CHARS) : '';
    if (!query) return undefined;

    try {
      const scope = config.sharedRecall.enabled ? 'own_and_granted' : 'own';
      const response = await client.recall(query, MAX_ENRICHMENT_RECORDS, scope);
      const results = Array.isArray(response.results) ? response.results : [];
      if (results.length === 0) return undefined;

      const lines = (results as Array<{ title: unknown; excerpt: unknown; citation: { canonicalUrl: unknown } }>).map((record) => {
        const title = escapeForModel(String(record.title));
        const excerpt = escapeForModel(String(record.excerpt));
        const url = escapeForModel(String(record.citation.canonicalUrl));
        return `- ${title}: ${excerpt} (${url})`;
      });
      return {
        appendContext: `Relevant Agent memory (cited, may be incomplete or stale):\n${lines.join('\n')}`,
      };
    } catch (error) {
      // Enrichment is best-effort; a client/server error must never fail the
      // turn or fabricate a result.
      if (error instanceof ApiClientError) {
        api.logger.debug?.(`agent memory bridge: prompt enrichment skipped (${error.code})`);
      }
      return undefined;
    }
  });
}
