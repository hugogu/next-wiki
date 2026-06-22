import createDOMPurify, { type DOMPurify } from 'dompurify';
import { JSDOM } from 'jsdom';

/**
 * Server-side SVG sanitizer used before any SVG bytes are persisted to the
 * content store (in-editor upload and Wiki.js / archive import). SVG can embed
 * active content — `<script>`, `on*` event handlers, `javascript:` URIs,
 * `<foreignObject>` HTML, and external references — so it is never stored as
 * received. DOMPurify is the sanitization gate; serving additionally applies a
 * strict `sandbox` CSP as defense in depth (see app/api/assets/[id]/route.ts).
 *
 * The returned bytes — not the input — are what gets hashed and stored, so the
 * persisted asset can never contain anything the sanitizer removed.
 */

let purifier: DOMPurify | null = null;

function getPurifier(): DOMPurify {
  if (purifier) return purifier;
  // A single jsdom window backs the sanitizer for the lifetime of the process.
  // This is a library instance, not application state, and holds no request or
  // tenant context between calls.
  const { window } = new JSDOM('');
  const instance = createDOMPurify(window as unknown as Window & typeof globalThis);

  // Drop href / xlink:href that point anywhere other than an in-document
  // fragment (`#id`). Internal fragments are needed for gradients, filters, and
  // `<use>`; everything else (external http(s), `javascript:`, `data:`) is an
  // external reference we refuse to preserve, independent of CSP.
  instance.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'href' || data.attrName === 'xlink:href') {
      if (!data.attrValue.startsWith('#')) {
        data.keepAttr = false;
      }
    }
  });

  purifier = instance;
  return instance;
}

/**
 * Sanitize SVG source bytes. Returns the sanitized SVG bytes (UTF-8), or `null`
 * when the input does not sanitize to a usable SVG document (no `<svg>` root
 * survives) — callers treat `null` as an unsupported/invalid image.
 */
export function sanitizeSvg(input: Buffer): Buffer | null {
  const source = input.toString('utf8');
  const clean = getPurifier()
    .sanitize(source, {
      USE_PROFILES: { svg: true, svgFilters: true },
      // Belt-and-suspenders on top of the SVG profile: never allow active
      // content, HTML embedding via <foreignObject>, or navigable links.
      FORBID_TAGS: ['script', 'foreignObject', 'a'],
      FORBID_ATTR: ['xlink:show', 'xlink:actuate'],
    })
    .trim();

  // The output must still be a real SVG document; otherwise the upload was not
  // actually an SVG (or sanitization stripped it to nothing).
  if (!/<svg[\s>]/i.test(clean)) return null;
  return Buffer.from(clean, 'utf8');
}
