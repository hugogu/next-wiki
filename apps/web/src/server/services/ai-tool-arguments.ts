/**
 * Normalize the narrowly-scoped XML parameter wrapper emitted by a few
 * OpenAI-compatible models inside an otherwise valid YAML tool call. The
 * wrapper is a rendering mistake, not a Wiki path, and its UUID was already
 * produced by an earlier permission-filtered tool result.
 */
const XML_PAGE_REFERENCE = /^\s*<parameter\s+name\s*=\s*["']?(pageId|node)["']?\s*>\s*([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\s*(?:<\/parameter\s*>)?\s*$/i;

export function normalizePageReferenceArguments(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const arguments_ = input as Record<string, unknown>;
  const path = arguments_.path;
  if (typeof path !== 'string') return arguments_;
  const match = path.match(XML_PAGE_REFERENCE);
  if (!match) return arguments_;

  const field = match[1] as 'pageId' | 'node';
  const normalized = { ...arguments_, [field]: match[2] };
  delete normalized.path;
  return normalized;
}

export function normalizePageReferenceToolArguments(
  arguments_: Record<string, unknown>,
): Record<string, unknown> {
  return normalizePageReferenceArguments(arguments_) as Record<string, unknown>;
}
