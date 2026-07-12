import { translationLanguageName } from '@next-wiki/shared';
import type { TextGenerationInput } from '@/server/ai/types';

/** Human-readable language name for phrasing the translation instruction. */
export function languageName(code: string): string {
  return translationLanguageName(code);
}

/**
 * Fixed rules that keep generated output a faithful Markdown translation and
 * nothing else. The generated Markdown still passes through the normal render
 * pipeline before a revision is written (P4), so these rules are about fidelity,
 * not trust.
 */
const MARKDOWN_RULES = [
  'Translate the natural-language prose into the target language.',
  'Preserve the exact Markdown structure: headings, lists, tables, blockquotes, and emphasis.',
  'Do NOT translate or alter code inside fenced or inline code spans.',
  'Preserve YAML frontmatter keys and any structural values; translate only human-readable frontmatter text such as title and summary.',
  'Keep link targets, image paths, and HTML attributes unchanged; you may translate visible link text and image alt text.',
  'Do not add, remove, or reorder sections. Do not add commentary, notes, or explanations.',
  'Return ONLY the translated Markdown document. Do not wrap the whole document in a code fence.',
].join('\n- ');

/**
 * Build the provider-neutral text-generation input for translating one page's
 * Markdown. `styleBody` is the immutable prompt-version instruction chosen for
 * the run; it is appended as additional guidance. No credentials, provider
 * identifiers, or unrelated data ever enter the prompt.
 */
export function buildTranslationInput(params: {
  actionId: string;
  modelExternalId: string;
  targetLocale: string;
  sourceMarkdown: string;
  styleBody: string | null;
  maxOutputTokens?: number;
  abortSignal: AbortSignal;
}): TextGenerationInput {
  const target = languageName(params.targetLocale);
  const system = [
    `You are a professional technical translator. Translate the wiki page below into ${target}.`,
    `Rules:\n- ${MARKDOWN_RULES}`,
    params.styleBody ? `Additional style guidance:\n${params.styleBody.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    actionId: params.actionId,
    modelExternalId: params.modelExternalId,
    system,
    messages: [
      {
        role: 'user',
        content: `Translate this Markdown document into ${target}. Output only the translated Markdown.\n\n<document>\n${params.sourceMarkdown}\n</document>`,
      },
    ],
    maxOutputTokens: params.maxOutputTokens,
    temperature: 0.2,
    abortSignal: params.abortSignal,
  };
}

/**
 * A leading moderation/safety annotation some routed models emit before (or
 * instead of) their answer, e.g. `User Safety: safe`. It is never part of a
 * real translation, so strip it from the top of the output.
 */
const SAFETY_PREAMBLE_RE = /^\s*(?:user\s+safety|safety|moderation|content\s+safety)\s*:\s*\w+\s*\n?/i;

/**
 * Normalize a model's raw output into publishable Markdown, or `null` when it is
 * empty/unusable. Strips a single wrapping code fence the model may have added
 * around the whole document, and a leading safety/moderation preamble line.
 * Keeps fences that are genuinely part of the content untouched.
 */
export function normalizeGeneratedMarkdown(raw: string): string | null {
  let text = raw.trim();
  // A safety label can appear before an optional code fence, so strip it first.
  text = text.replace(SAFETY_PREAMBLE_RE, '').trim();
  const fence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/;
  const match = text.match(fence);
  if (match) text = match[1]!.trim();
  return text.length > 0 ? text : null;
}

/**
 * Reject output that is implausibly short for its source — a translation of a
 * non-trivial page cannot collapse to a few characters (a routed model that
 * emitted only a safety label or a truncated answer). This is deliberately
 * conservative: it only fires when the source is substantial and the output is
 * tiny in absolute terms, so genuinely short translations are never rejected.
 */
export function isImplausiblyShortTranslation(sourceMarkdown: string, output: string): boolean {
  return sourceMarkdown.trim().length >= 200 && output.trim().length < 40;
}
