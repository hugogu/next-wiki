import postcss, { type AtRule } from 'postcss';
import { DomainError } from '@/server/errors';

/**
 * Confine user-authored Markdown theme CSS to typography/layout (FR-017, R5):
 * - allowlist only typography/spacing/border-geometry properties (no colors,
 *   no backgrounds — those inherit the system tokens, FR-011a)
 * - strip remote/dangerous values (`url(...)`, `@import`, `expression(...)`)
 * - drop at-rules other than `@media`
 * Scoping under the content root is applied separately at injection time.
 */

const MAX_CSS_LENGTH = 20_000;
const ALLOWED_AT_RULES = new Set(['media']);
export const THEME_SCOPE = '.prose.prose';

function isAllowedProperty(prop: string): boolean {
  const p = prop.trim().toLowerCase();
  if (p.startsWith('--')) return false;
  if (p === 'color' || p.endsWith('-color') || p.startsWith('background')) return false;
  if (p.startsWith('border')) {
    // border geometry only — never the color-bearing shorthands
    return /^border(-(top|right|bottom|left))?-(width|style)$/.test(p) || p.includes('radius');
  }
  return (
    p.startsWith('font') ||
    p.startsWith('text') ||
    p === 'line-height' ||
    p === 'letter-spacing' ||
    p === 'word-spacing' ||
    p === 'white-space' ||
    p.startsWith('margin') ||
    p.startsWith('padding') ||
    p.startsWith('list-style') ||
    p === 'max-width' ||
    p === 'vertical-align' ||
    p === 'quotes' ||
    p === 'hyphens' ||
    p === 'tab-size'
  );
}

function isForbiddenValue(value: string): boolean {
  const v = value.toLowerCase();
  return (
    v.includes('url(') ||
    v.includes('expression(') ||
    v.includes('image-set') ||
    v.includes('javascript:') ||
    v.includes('@import')
  );
}

/** Sanitize on save. Returns cleaned CSS (element selectors preserved). */
export function sanitizeThemeCss(css: string): string {
  if (css.length > MAX_CSS_LENGTH) {
    throw new DomainError('BAD_REQUEST', 'Theme stylesheet is too large');
  }
  let root;
  try {
    root = postcss.parse(css);
  } catch {
    throw new DomainError('BAD_REQUEST', 'Theme stylesheet is not valid CSS');
  }

  root.walkAtRules((at) => {
    if (!ALLOWED_AT_RULES.has(at.name.toLowerCase())) at.remove();
  });
  root.walkDecls((decl) => {
    if (!isAllowedProperty(decl.prop) || isForbiddenValue(decl.value)) decl.remove();
  });
  root.walkRules((rule) => {
    if (rule.nodes.length === 0) rule.remove();
  });

  return root.toString();
}

/** Prefix every rule's selectors with the content-root scope for injection. */
export function scopeThemeCss(css: string, scope: string = THEME_SCOPE): string {
  let root;
  try {
    root = postcss.parse(css);
  } catch {
    return '';
  }
  root.walkRules((rule) => {
    const parent = rule.parent;
    if (parent && parent.type === 'atrule' && /keyframes/i.test((parent as AtRule).name)) return;
    rule.selectors = rule.selectors.map((sel) => `${scope} ${sel}`);
  });
  return root.toString();
}
