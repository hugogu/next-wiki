import postcss from 'postcss';
import { DomainError } from '@/server/errors';

/**
 * Confine admin-authored system-theme CSS to safe, token-driven styling (006).
 *
 * - Structural / typography / layout properties are allowlisted.
 * - Color-bearing properties (`color`, `background*`, `*-color`, `fill`,
 *   `stroke`) are allowed ONLY with a design-token value (`var(--…)`) or a safe
 *   keyword (`transparent`, `currentColor`, `inherit`, …). Hardcoded hex/rgb
 *   colors are stripped, so themes stay consistent across light/dark and never
 *   pin off-palette colors.
 * - `content` is allowed (pseudo-element icons), as are flex/grid alignment
 *   properties. Remote / dangerous values (`url()`, `@import`, `expression()`,
 *   …) are always stripped, and only `@media` / `@keyframes` at-rules survive.
 */

const MAX_CSS_LENGTH = 50_000;
const ALLOWED_AT_RULES = new Set(['media', 'keyframes']);
const SAFE_COLOR_KEYWORDS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'none',
]);

/** Properties whose value carries a color and must be token/keyword-only. */
function isColorProperty(p: string): boolean {
  return (
    p === 'color' ||
    p.endsWith('-color') ||
    p.startsWith('background') ||
    p === 'fill' ||
    p === 'stroke'
  );
}

/** A color value is allowed only if it is a design token or a safe keyword. */
function isTokenOrKeywordColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.includes('var(--') || SAFE_COLOR_KEYWORDS.has(v);
}

function isAllowedProperty(prop: string): boolean {
  const p = prop.trim().toLowerCase();
  if (p.startsWith('--')) return false;
  if (p.startsWith('border')) {
    // border geometry only — color longhands go through the color path
    return /^border(-(top|right|bottom|left))?-(width|style)$/.test(p) || p.includes('radius');
  }
  return (
    p === 'content' ||
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
    p === 'tab-size' ||
    p === 'display' ||
    p === 'position' ||
    p === 'top' ||
    p === 'right' ||
    p === 'bottom' ||
    p === 'left' ||
    p === 'z-index' ||
    p.startsWith('flex') ||
    p.startsWith('grid') ||
    p.startsWith('align') ||
    p.startsWith('justify') ||
    p.startsWith('place') ||
    p === 'order' ||
    p === 'gap' ||
    p === 'row-gap' ||
    p === 'column-gap' ||
    p === 'width' ||
    p === 'height' ||
    p.startsWith('max-') ||
    p.startsWith('min-') ||
    p.startsWith('overflow') ||
    p.startsWith('transform') ||
    p.startsWith('transition') ||
    p.startsWith('animation') ||
    p === 'box-shadow' ||
    p === 'opacity' ||
    p === 'cursor' ||
    p === 'pointer-events' ||
    p === 'visibility' ||
    p === 'aspect-ratio'
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

/** Sanitize on save. Returns cleaned CSS. */
export function sanitizeSystemThemeCss(css: string): string {
  if (css.length > MAX_CSS_LENGTH) {
    throw new DomainError('BAD_REQUEST', 'System theme stylesheet is too large');
  }
  let root;
  try {
    root = postcss.parse(css);
  } catch {
    throw new DomainError('BAD_REQUEST', 'System theme stylesheet is not valid CSS');
  }

  root.walkAtRules((at) => {
    if (!ALLOWED_AT_RULES.has(at.name.toLowerCase())) at.remove();
  });
  root.walkDecls((decl) => {
    if (isForbiddenValue(decl.value)) {
      decl.remove();
      return;
    }
    const prop = decl.prop.trim().toLowerCase();
    if (isColorProperty(prop)) {
      if (!isTokenOrKeywordColor(decl.value)) decl.remove();
      return;
    }
    if (!isAllowedProperty(prop)) decl.remove();
  });
  root.walkRules((rule) => {
    if (rule.nodes.length === 0) rule.remove();
  });

  return root.toString();
}
