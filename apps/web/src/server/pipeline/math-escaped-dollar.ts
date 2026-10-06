/**
 * Let a backslash-escaped dollar sign (`\$`) sit inside inline math.
 *
 * `micromark-extension-math` reads inline math the way CommonMark reads a code
 * span: once a `$` opens it, every character is data until the next `$`. So the
 * `$` of `\$` closes the span, `$\$100{,}000$` ends after the backslash, and
 * every later `$` on the line pairs with the wrong neighbour. There is no option
 * for this; upstream's answer is to wrap the dollar in a longer delimiter.
 *
 * TeX, KaTeX and Pandoc read `\$` as a literal dollar sign, and that is how
 * authors (and LLMs) write money inside a formula. The one rule added here: in
 * an inline span a backslash makes the `$` or `\` after it plain content, so it
 * can neither close the span nor count towards the closing run. Pairing the
 * backslashes this way is what keeps `$a\\$` closing, as TeX reads it.
 *
 * Outside a span nothing changes — `\$` is already a character escape there, so
 * it never opens math. Everything else is upstream's: the construct is
 * upstream's with its tokenizer swapped, and the token names are unchanged, so
 * `mdast-util-math` builds the same `inlineMath` nodes. Block `$$` math is not
 * touched; its closing fence sits alone on a line.
 *
 * `findClosingRun` in `protect-math-pipes.ts` mirrors this rule over raw text.
 */

import { math } from 'micromark-extension-math';
import { markdownLineEnding } from 'micromark-util-character';
import type { Code, Construct, Extension, State, Token, Tokenizer } from 'micromark-util-types';
import remarkMath from 'remark-math';
import type { Preset, Processor } from 'unified';

const CODE_SPACE = 32;
const CODE_DOLLAR = 36;
const CODE_BACKSLASH = 92;

/**
 * Upstream's `tokenize` with one change, in `data`. The `resolve` hook (space
 * padding) and `previous` check (what may precede an opening `$`) are reused
 * from the upstream construct rather than copied, so they cannot drift apart.
 */
const tokenizeMathText: Tokenizer = function (effects, ok, nok) {
  let sizeOpen = 0;
  let sizeClose = 0;
  let closingSequence: Token;

  return start;

  function start(code: Code): State | undefined {
    effects.enter('mathText');
    effects.enter('mathTextSequence');
    return sequenceOpen(code);
  }

  function sequenceOpen(code: Code): State | undefined {
    if (code === CODE_DOLLAR) {
      effects.consume(code);
      sizeOpen++;
      return sequenceOpen;
    }
    effects.exit('mathTextSequence');
    return between(code);
  }

  function between(code: Code): State | undefined {
    if (code === null) return nok(code);

    if (code === CODE_DOLLAR) {
      closingSequence = effects.enter('mathTextSequence');
      sizeClose = 0;
      return sequenceClose(code);
    }

    if (code === CODE_SPACE) {
      effects.enter('space');
      effects.consume(code);
      effects.exit('space');
      return between;
    }

    if (markdownLineEnding(code)) {
      effects.enter('lineEnding');
      effects.consume(code);
      effects.exit('lineEnding');
      return between;
    }

    effects.enter('mathTextData');
    return data(code);
  }

  function data(code: Code): State | undefined {
    if (code === null || code === CODE_SPACE || code === CODE_DOLLAR || markdownLineEnding(code)) {
      effects.exit('mathTextData');
      return between(code);
    }
    effects.consume(code);
    return code === CODE_BACKSLASH ? escape : data;
  }

  /** The character after a backslash. Only `$` and `\` need pairing: they are the two that bear on where a span ends. */
  function escape(code: Code): State | undefined {
    if (code === CODE_DOLLAR || code === CODE_BACKSLASH) {
      effects.consume(code);
      return data;
    }
    return data(code);
  }

  function sequenceClose(code: Code): State | undefined {
    if (code === CODE_DOLLAR) {
      effects.consume(code);
      sizeClose++;
      return sequenceClose;
    }

    if (sizeClose === sizeOpen) {
      effects.exit('mathTextSequence');
      effects.exit('mathText');
      return ok(code);
    }

    // A run of another length is content, not the end of the span.
    closingSequence.type = 'mathTextData';
    return data(code);
  }
};

function upstreamTextConstruct(): Construct {
  const construct = math().text?.[CODE_DOLLAR];
  if (!construct || Array.isArray(construct)) {
    throw new Error('micromark-extension-math no longer exposes a single inline construct for `$`');
  }
  return construct;
}

const escapedDollarMath: Extension = {
  // Upstream's inline construct stays registered by `remark-math`, and would be
  // tried whenever this one declines a `$`, pairing it the old way. Constructs
  // are switched off by name.
  disable: { null: ['mathText'] },
  text: {
    [CODE_DOLLAR]: {
      ...upstreamTextConstruct(),
      name: 'mathTextEscapedDollar',
      tokenize: tokenizeMathText,
    },
  },
};

function addEscapedDollarSyntax(this: Processor): undefined {
  const data = this.data();
  const extensions = data.micromarkExtensions ?? (data.micromarkExtensions = []);
  extensions.push(escapedDollarMath);
}

/** `remark-math`, with `\$` allowed inside inline math. Use in place of it. */
export const remarkMathWithEscapedDollar: Preset = {
  plugins: [remarkMath, addEscapedDollarSyntax],
};
