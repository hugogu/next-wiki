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
  'Do not restate or describe the task, and do not think out loud. Never write meta sentences such as "The user wants me to…", "I need to…", or "Here is the translation". Begin your response directly with the first line of the translated document.',
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
  /** Deadline for the whole streamed document; `null` disables it. */
  timeoutMs?: number | null;
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
        content: `Translate this Markdown document into ${target}. Respond with the translated Markdown only — no preface, no reasoning, no explanation. Start directly with the document's first line.\n\n<document>\n${params.sourceMarkdown}\n</document>`,
      },
    ],
    maxOutputTokens: params.maxOutputTokens,
    temperature: 0.2,
    abortSignal: params.abortSignal,
    timeoutMs: params.timeoutMs,
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

/** Han, Kana and Hangul (and the compatibility ideographs): scripts that run about a token per character. */
const CJK_CHARACTER = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/gu;

/**
 * Rough token count of `text`, weighted by script. Latin text runs about four
 * characters per token, but Chinese, Japanese and Korean run about one token per
 * character, so a plain `length / 4` is several times too small for them.
 */
export function estimateTokens(text: string): number {
  const cjk = text.match(CJK_CHARACTER)?.length ?? 0;
  return cjk + Math.ceil((text.length - cjk) / 4);
}

/**
 * Choose a safe `max_output_tokens` for translating one page. Some catalog
 * models report `maxOutputTokens` equal to their full context window; passing
 * that verbatim makes every request exceed the context limit (input + requested
 * output > window) and fail. Cap the request to roughly twice the source size
 * (translations track the source length) and always leave room for the input.
 *
 * `reasons` is for a model that thinks before it answers: those tokens count
 * against the same limit, so it needs room for both. Without it a reasoning
 * model can spend the whole limit thinking and never write a word.
 */
export function computeMaxOutputTokens(
  sourceMarkdown: string,
  contextWindow: number | null,
  modelMaxOutput: number | null,
  options: { reasons?: boolean } = {},
): number {
  const estSourceTokens = estimateTokens(sourceMarkdown);
  // System prompt + user wrapper + a safety margin for tokenizer variance.
  const estInput = estSourceTokens + 800;
  // Translations rarely exceed ~2x the source; add a floor for short pages.
  const answerTokens = estSourceTokens * 2 + 1024;
  let maxOut = Math.min(modelMaxOutput ?? 8192, options.reasons ? answerTokens * 2 : answerTokens);
  if (contextWindow && contextWindow > 0) {
    maxOut = Math.min(maxOut, contextWindow - estInput - 256);
  }
  return Math.max(256, maxOut);
}

/**
 * Whether a provider's finish reason says the response was cut off at the
 * output limit rather than finished: `length` from OpenAI-style streams,
 * `max_tokens` from Anthropic's. Such output is incomplete by definition.
 */
export function reachedOutputLimit(finishReason: string | null | undefined): boolean {
  return finishReason === 'length' || finishReason === 'max_tokens';
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
