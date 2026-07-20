/**
 * Convert a KaTeX/LaTeX math expression into a single-variable expression that
 * function-plot's built-in evaluator (`built-in-math-eval`) can plot.
 *
 * This is deliberately *not* a complete LaTeX parser. It recognizes the common
 * shapes that describe a plottable function of one variable — polynomials,
 * fractions, roots, trig/exp/log, absolute value via functions — and rewrites
 * them into infix math. Anything it does not understand yields `null`, and the
 * caller simply does not offer a plot for that formula. Being conservative is
 * the point: a missing plot icon is fine, a wrong plot is not.
 */

export interface PlottableExpression {
  /** Expression rewritten in terms of `x`, ready for function-plot's `fn`. */
  expr: string;
  /** The original variable symbol (e.g. `t`) before it was normalized to `x`. */
  variable: string;
}

/** Function names understood by `built-in-math-eval` (function-plot's parser). */
const KNOWN_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh',
  'sqrt', 'cbrt', 'nthRoot', 'pow',
  'log', 'log10', 'log2', 'exp',
  'abs', 'sign', 'floor', 'ceil', 'round', 'min', 'max',
]);

/** LaTeX command -> parser function name, for names used in prefix form. */
const FUNCTION_COMMANDS: Record<string, string> = {
  sin: 'sin', cos: 'cos', tan: 'tan',
  arcsin: 'asin', arccos: 'acos', arctan: 'atan',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  ln: 'log', log: 'log10', lg: 'log10',
  exp: 'exp', min: 'min', max: 'max',
};

/** LaTeX commands that simply unwrap to their group content. */
const PASSTHROUGH_COMMANDS = new Set([
  'mathrm', 'mathbf', 'mathit', 'mathsf', 'text', 'operatorname', 'left', 'right',
]);

/** Raised when a construct is not supported; converts to a `null` result. */
class UnsupportedTex extends Error {}

/** Read a `{...}` group starting at `i` (which must be `{`). */
function readGroup(src: string, i: number): { body: string; end: number } | null {
  if (src[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return { body: src.slice(i + 1, j), end: j };
    }
  }
  return null;
}

/**
 * Read a single LaTeX argument at `i`: a `{...}` group, a `\command`, or one
 * bare character. Returns the raw TeX slice (to be transformed by the caller).
 */
function readArg(src: string, i: number): { text: string; next: number } | null {
  while (src[i] === ' ') i++;
  const c = src[i];
  if (c === undefined) return null;
  if (c === '{') {
    const g = readGroup(src, i);
    if (!g) return null;
    return { text: g.body, next: g.end + 1 };
  }
  if (c === '\\') {
    const m = /^\\[a-zA-Z]+/.exec(src.slice(i));
    if (m) return { text: m[0], next: i + m[0].length };
    return { text: src.slice(i, i + 2), next: i + 2 };
  }
  return { text: c, next: i + 1 };
}

/** Transform a LaTeX fragment into an infix math string. Throws on the unknown. */
function transform(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];

    if (c === '\\') {
      const m = /^\\([a-zA-Z]+)/.exec(src.slice(i));
      if (!m) {
        // Escaped symbol: spacing macros are dropped, delimiters unwrapped.
        const sym = src[i + 1];
        i += 2;
        if (sym === ',' || sym === ';' || sym === ':' || sym === '!' || sym === ' ') continue;
        if (sym === '{') { out += '('; continue; }
        if (sym === '}') { out += ')'; continue; }
        throw new UnsupportedTex(`escape \\${sym}`);
      }
      const cmd = m[1]!;
      i += m[0].length;
      const handled = handleCommand(cmd, src, i);
      out += handled.text;
      i = handled.next;
      continue;
    }

    if (c === '{') {
      const g = readGroup(src, i);
      if (!g) throw new UnsupportedTex('unbalanced {');
      out += `(${transform(g.body)})`;
      i = g.end + 1;
      continue;
    }
    if (c === '}') throw new UnsupportedTex('unbalanced }');

    if (c === '^') {
      const arg = readArg(src, i + 1);
      if (!arg) throw new UnsupportedTex('empty exponent');
      out += `^(${transform(arg.text)})`;
      i = arg.next;
      continue;
    }

    // Subscripts and relations describe things that are not a plain function.
    if (c === '_' || c === '<' || c === '>' || c === '=' || c === '&') {
      throw new UnsupportedTex(`char ${c}`);
    }

    out += c;
    i++;
  }
  return out;
}

/** Handle a `\command` beginning right after its name at position `i`. */
function handleCommand(cmd: string, src: string, i: number): { text: string; next: number } {
  if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
    const a = readArg(src, i);
    if (!a) throw new UnsupportedTex('frac numerator');
    const b = readArg(src, a.next);
    if (!b) throw new UnsupportedTex('frac denominator');
    return { text: `((${transform(a.text)})/(${transform(b.text)}))`, next: b.next };
  }

  if (cmd === 'sqrt') {
    let j = i;
    let degree: string | null = null;
    if (src[j] === '[') {
      const close = src.indexOf(']', j);
      if (close === -1) throw new UnsupportedTex('sqrt degree');
      degree = src.slice(j + 1, close);
      j = close + 1;
    }
    const arg = readArg(src, j);
    if (!arg) throw new UnsupportedTex('sqrt radicand');
    const body = transform(arg.text);
    const text = degree === null
      ? `sqrt(${body})`
      : `nthRoot((${body}),(${transform(degree)}))`;
    return { text, next: arg.next };
  }

  if (PASSTHROUGH_COMMANDS.has(cmd)) {
    // `\left`/`\right` are followed by a delimiter char; `\left.`/`\right.`
    // mean "no delimiter", so drop the dot.
    if ((cmd === 'left' || cmd === 'right') && src[i] === '.') {
      return { text: '', next: i + 1 };
    }
    const arg = readArg(src, i);
    if (cmd === 'left' || cmd === 'right' || !arg) return { text: '', next: i };
    return { text: transform(arg.text), next: arg.next };
  }

  const fn = FUNCTION_COMMANDS[cmd];
  if (fn) {
    let j = i;
    while (src[j] === ' ') j++;
    // `\sin(x)` — the paren group is the argument and passes through as-is.
    if (src[j] === '(') return { text: fn, next: j };
    // `\sin x` — grab the next single argument and wrap it in a call.
    const arg = readArg(src, j);
    if (!arg) throw new UnsupportedTex(`${cmd} argument`);
    return { text: `${fn}(${transform(arg.text)})`, next: arg.next };
  }

  if (cmd === 'cdot' || cmd === 'times' || cmd === 'ast') return { text: '*', next: i };
  if (cmd === 'div') return { text: '/', next: i };
  if (cmd === 'pi') return { text: 'PI', next: i };
  if (cmd === 'tau') return { text: '(2*PI)', next: i };

  throw new UnsupportedTex(`\\${cmd}`);
}

type Token =
  | { type: 'num'; value: string }
  | { type: 'op'; value: string }
  | { type: 'id'; value: string; kind: 'func' | 'const' | 'var' };

/** Tokenize an infix string; returns `null` on any illegal character. */
function tokenize(infix: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < infix.length) {
    const c = infix[i]!;
    if (c === ' ') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < infix.length && /[0-9.]/.test(infix[j]!)) j++;
      tokens.push({ type: 'num', value: infix.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      // Allow trailing digits so function names like `log10`, `log2`, `atan2`
      // tokenize as a single identifier rather than name + number.
      let j = i + 1;
      while (j < infix.length && /[a-zA-Z0-9]/.test(infix[j]!)) j++;
      const name = infix.slice(i, j);
      if (KNOWN_FUNCTIONS.has(name)) {
        tokens.push({ type: 'id', value: name, kind: 'func' });
      } else if (name === 'PI' || name === 'E') {
        tokens.push({ type: 'id', value: name, kind: 'const' });
      } else if (name === 'e') {
        tokens.push({ type: 'id', value: 'E', kind: 'const' });
      } else if (name.length === 1) {
        tokens.push({ type: 'id', value: name, kind: 'var' });
      } else {
        return null; // unknown multi-letter identifier (e.g. sec, undefined fn)
      }
      i = j;
      continue;
    }
    if ('+-*/^(),'.includes(c)) {
      tokens.push({ type: 'op', value: c });
      i++;
      continue;
    }
    return null;
  }
  return tokens;
}

const isValueEnd = (t: Token): boolean =>
  t.type === 'num' || (t.type === 'id' && t.kind !== 'func') || (t.type === 'op' && t.value === ')');

const isValueStart = (t: Token): boolean =>
  t.type === 'num' || t.type === 'id' || (t.type === 'op' && t.value === '(');

/** Lightweight structural sanity check to avoid offering plots for junk. */
function isWellFormed(expr: string): boolean {
  let depth = 0;
  for (const c of expr) {
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth < 0) return false; }
  }
  if (depth !== 0) return false;
  if (expr.includes('()')) return false;
  if (/[+\-*/^]$/.test(expr.trim())) return false;
  if (/^[*/^]/.test(expr.trim())) return false; // leading +/- (unary) is fine
  return true;
}

/**
 * Parse a LaTeX math source into a plottable single-variable expression, or
 * `null` if it is not a function of exactly one variable that we can render.
 */
export function parsePlottableTex(tex: string): PlottableExpression | null {
  let source = tex.trim();
  if (!source) return null;

  // If it is an equation/definition (`y = ...`, `f(x) = ...`), plot the RHS.
  // More than one `=` is a chained relation, not a function.
  const equals = source.split('=');
  if (equals.length === 2) source = equals[1]!;
  else if (equals.length > 2) return null;

  let infix: string;
  try {
    infix = transform(source);
  } catch {
    return null;
  }

  const tokens = tokenize(infix);
  if (!tokens) return null;

  const variables = new Set<string>();
  for (const t of tokens) {
    if (t.type === 'id' && t.kind === 'var') variables.add(t.value);
  }
  if (variables.size !== 1) return null;
  const variable = [...variables][0]!;

  let expr = '';
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]!;
    if (k > 0 && isValueEnd(tokens[k - 1]!) && isValueStart(t)) expr += '*';
    expr += t.type === 'id' && t.kind === 'var' ? 'x' : t.value;
  }

  if (!isWellFormed(expr)) return null;

  // Skip trivial formulas: a lone variable (e.g. `$x$`, or `f(z) = y`) would
  // only ever plot the line y = x, which is noise next to prose. Require some
  // actual operation or function call. A leading unary minus does not count.
  if (!/[+\-*/^(]/.test(expr.replace(/^-/, ''))) return null;

  return { expr, variable };
}
