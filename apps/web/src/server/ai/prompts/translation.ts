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
 * Strip a single wrapping code fence the model may have added around the whole
 * document despite instructions, and reject empty output. Keeps fences that are
 * genuinely part of the content untouched.
 */
export function normalizeGeneratedMarkdown(raw: string): string | null {
  let text = raw.trim();
  const fence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/;
  const match = text.match(fence);
  if (match) text = match[1]!.trim();
  return text.length > 0 ? text : null;
}
