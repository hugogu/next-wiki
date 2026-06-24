import postcss from 'postcss';
import { DomainError } from '@/server/errors';

/**
 * Confine admin-authored system-theme CSS to layout/structure/typography
 * (006). Colors and backgrounds are NOT allowed because they belong to the
 * user's reading-theme tokens; the admin's CSS styles the app shell, not
 * content. The allowlist mirrors the previous user-CSS sanitizer but
 * additionally permits layout properties and `@keyframes` (with color
 * declarations inside keyframes stripped).
 */

const MAX_CSS_LENGTH = 50_000;
const ALLOWED_AT_RULES = new Set(['media', 'keyframes']);

function isAllowedProperty(prop: string): boolean {
  const p = prop.trim().toLowerCase();
  if (p.startsWith('--')) return false;
  if (p === 'color' || p.endsWith('-color') || p.startsWith('background')) return false;
  if (p.startsWith('border')) {
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
    p === 'width' ||
    p === 'height' ||
    p.startsWith('max-') ||
    p.startsWith('min-') ||
    p === 'gap' ||
    p === 'row-gap' ||
    p === 'column-gap' ||
    p.startsWith('overflow') ||
    p.startsWith('transform') ||
    p.startsWith('transition') ||
    p.startsWith('animation') ||
    p === 'box-shadow' ||
    p === 'opacity' ||
    p === 'cursor' ||
    p === 'pointer-events' ||
    p === 'visibility'
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
    if (!isAllowedProperty(decl.prop) || isForbiddenValue(decl.value)) decl.remove();
  });
  root.walkRules((rule) => {
    if (rule.nodes.length === 0) rule.remove();
  });

  return root.toString();
}
