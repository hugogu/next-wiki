/**
 * Whether the reader folded the right-hand Outline sidebar away to a thin rail
 * to give the article more room, kept in this browser only. Public reader pages
 * are cached static documents that must not vary by who asks, so the choice
 * never reaches the server: it is mirrored onto <html> as an attribute that the
 * stylesheet reads (see `.reader-sidebar` in globals.css).
 *
 * Folding the sidebar away changes how wide the article is, so the choice has to
 * be in place before the first paint, or the text would re-wrap once the page
 * has loaded. `outlineBootstrapScript` therefore runs in <head> (see
 * app/layout.tsx), the way the theme does.
 */
export const OUTLINE_STORAGE_KEY = 'next-wiki-outline-collapsed';
export const OUTLINE_ATTRIBUTE = 'data-outline-collapsed';
const COLLAPSED = 'true';

/** The sidebar's contents, which the toggle buttons expand and collapse. */
export const OUTLINE_BODY_ID = 'reader-sidebar-body';

/**
 * Applies the saved choice to <html> before the first paint, and follows a choice
 * made in another tab. Everything it needs is inlined: it runs as plain text,
 * outside any bundle.
 */
export const outlineBootstrapScript = `
(function () {
  var key = ${JSON.stringify(OUTLINE_STORAGE_KEY)};
  var attribute = ${JSON.stringify(OUTLINE_ATTRIBUTE)};
  var root = document.documentElement;
  function apply() {
    try {
      if (localStorage.getItem(key) === ${JSON.stringify(COLLAPSED)}) root.setAttribute(attribute, '');
      else root.removeAttribute(attribute);
    } catch (e) {}
  }
  apply();
  window.addEventListener('storage', function (event) {
    if (event.key === key || event.key === null) apply();
  });
})();
`
  .replace(/\s*\n\s*/g, ' ')
  .trim();

/** Fold the sidebar away, or bring it back, and remember which. */
export function setOutlineCollapsed(collapsed: boolean): void {
  const root = document.documentElement;
  if (collapsed) root.setAttribute(OUTLINE_ATTRIBUTE, '');
  else root.removeAttribute(OUTLINE_ATTRIBUTE);
  try {
    if (collapsed) window.localStorage.setItem(OUTLINE_STORAGE_KEY, COLLAPSED);
    else window.localStorage.removeItem(OUTLINE_STORAGE_KEY);
  } catch {
    // Storage can be blocked: the choice then lasts until the page is closed.
  }
}
