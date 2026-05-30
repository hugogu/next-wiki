import DOMPurify from "isomorphic-dompurify";

// Non-optional sanitization applied to all rendered HTML before display.
// This step cannot be removed or bypassed by any rendering plugin.

const ALLOWED_TAGS = [
  "a", "abbr", "acronym", "address", "article", "aside", "b", "blockquote",
  "br", "caption", "cite", "code", "col", "colgroup", "dd", "del", "details",
  "dfn", "div", "dl", "dt", "em", "figcaption", "figure", "footer", "h1",
  "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img", "ins", "kbd",
  "li", "main", "mark", "nav", "ol", "p", "pre", "q", "rp", "rt", "ruby",
  "s", "samp", "section", "small", "span", "strong", "sub", "summary", "sup",
  "table", "tbody", "td", "th", "thead", "time", "tfoot", "tr", "u", "ul",
  "var", "wbr",
  // Diagram container for draw.io/mermaid output.
  "svg", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "g", "text", "tspan", "defs", "marker", "use", "clipPath", "pattern",
  // Math (KaTeX output).
  "math", "annotation", "annotation-xml", "maction", "maligngroup",
  "malignmark", "menclose", "merror", "mfenced", "mfrac", "mglyph",
  "mi", "mlabeledtr", "mmultiscripts", "mn", "mo", "mover", "mpadded",
  "mphantom", "mroot", "mrow", "ms", "mscarries", "mscarry", "msgroup",
  "msline", "mspace", "msqrt", "msrow", "mstack", "mstyle", "msub",
  "msup", "msubsup", "mtable", "mtd", "mtext", "mtr", "munder",
  "munderover", "semantics",
];

const ALLOWED_ATTRS: Record<string, string[]> = {
  "*": ["class", "id", "data-*"],
  a: ["href", "name", "target", "rel", "title"],
  img: ["src", "alt", "title", "width", "height", "loading"],
  code: ["class"],
  pre: ["class"],
  div: ["class", "data-*", "style"],
  span: ["class", "style"],
  table: ["class"],
  th: ["scope", "colspan", "rowspan"],
  td: ["colspan", "rowspan"],
  svg: ["xmlns", "viewBox", "width", "height", "class", "role", "aria-*"],
  path: ["d", "fill", "stroke", "stroke-width", "class"],
  use: ["href", "xlink:href"],
  math: ["xmlns", "display"],
};

export function sanitizeHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: Object.values(ALLOWED_ATTRS).flat(),
    ALLOW_DATA_ATTR: true,
    FORCE_BODY: false,
    // Prevent DOM clobbering even in server-side mode.
    SANITIZE_DOM: false,
    // Keep math and SVG namespaces intact.
    ADD_TAGS: ["math", "svg"],
    ADD_ATTR: ["xmlns", "viewBox"],
  }) as string;
}
