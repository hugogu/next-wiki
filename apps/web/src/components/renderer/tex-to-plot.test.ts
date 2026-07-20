import { describe, expect, it } from 'vitest';
// @ts-expect-error - built-in-math-eval ships no type definitions
import compile from 'built-in-math-eval';
import { parsePlottableTex } from './tex-to-plot';

/** Compile the produced expression the same way function-plot does, to prove
 *  it is not just syntactically plausible but actually evaluable. */
function evalAt(expr: string, x: number): number {
  return compile(expr).eval({ x });
}

describe('parsePlottableTex', () => {
  it('handles polynomials with implicit multiplication', () => {
    const r = parsePlottableTex('2x^2 - 3x + 1');
    expect(r).not.toBeNull();
    expect(r!.variable).toBe('x');
    expect(evalAt(r!.expr, 2)).toBeCloseTo(2 * 4 - 3 * 2 + 1);
  });

  it('converts fractions', () => {
    const r = parsePlottableTex('\\frac{1}{x}');
    expect(r).not.toBeNull();
    expect(evalAt(r!.expr, 4)).toBeCloseTo(0.25);
  });

  it('converts the logistic function', () => {
    const r = parsePlottableTex('\\frac{1}{1+e^{-x}}');
    expect(r).not.toBeNull();
    expect(evalAt(r!.expr, 0)).toBeCloseTo(0.5);
  });

  it('takes the right-hand side of an equation', () => {
    const r = parsePlottableTex('y = x^2 + 1');
    expect(r).not.toBeNull();
    expect(evalAt(r!.expr, 3)).toBeCloseTo(10);
  });

  it('drops the left-hand side of a function definition', () => {
    const r = parsePlottableTex('f(x) = \\sin(x)');
    expect(r).not.toBeNull();
    expect(evalAt(r!.expr, Math.PI / 2)).toBeCloseTo(1);
  });

  it('supports prefix trig without parentheses', () => {
    const r = parsePlottableTex('\\cos x');
    expect(r).not.toBeNull();
    expect(evalAt(r!.expr, 0)).toBeCloseTo(1);
  });

  it('converts square roots and n-th roots', () => {
    expect(evalAt(parsePlottableTex('\\sqrt{x}')!.expr, 9)).toBeCloseTo(3);
    expect(evalAt(parsePlottableTex('\\sqrt[3]{x}')!.expr, 27)).toBeCloseTo(3);
  });

  it('maps ln, log and pi', () => {
    expect(evalAt(parsePlottableTex('\\ln x')!.expr, Math.E)).toBeCloseTo(1);
    expect(evalAt(parsePlottableTex('\\log x')!.expr, 1000)).toBeCloseTo(3);
    expect(evalAt(parsePlottableTex('\\pi x')!.expr, 2)).toBeCloseTo(2 * Math.PI);
  });

  it('normalizes a non-x variable to x', () => {
    const r = parsePlottableTex('t^2 + 1');
    expect(r).not.toBeNull();
    expect(r!.variable).toBe('t');
    expect(r!.expr).toBe('x^(2)+1');
  });

  it('strips \\left \\right and cdot', () => {
    const r = parsePlottableTex('2 \\cdot \\left( x + 1 \\right)');
    expect(r).not.toBeNull();
    expect(evalAt(r!.expr, 3)).toBeCloseTo(8);
  });

  it('rejects multivariable expressions', () => {
    expect(parsePlottableTex('x + y')).toBeNull();
  });

  it('rejects constants with no variable', () => {
    expect(parsePlottableTex('\\pi')).toBeNull();
    expect(parsePlottableTex('42')).toBeNull();
  });

  it('rejects a lone variable that would only plot y = x', () => {
    expect(parsePlottableTex('x')).toBeNull();
    expect(parsePlottableTex('p')).toBeNull();
    expect(parsePlottableTex('-t')).toBeNull();
    expect(parsePlottableTex('f(z) = y')).toBeNull();
  });

  it('rejects unsupported constructs', () => {
    expect(parsePlottableTex('\\sum_{i=0}^{n} i')).toBeNull();
    expect(parsePlottableTex('\\int_0^1 x\\,dx')).toBeNull();
    expect(parsePlottableTex('x_1 + x_2')).toBeNull();
    expect(parsePlottableTex('x \\leq 5')).toBeNull();
    expect(parsePlottableTex('\\begin{matrix} a & b \\end{matrix}')).toBeNull();
  });

  it('rejects chained relations', () => {
    expect(parsePlottableTex('a = b = c')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(parsePlottableTex('   ')).toBeNull();
  });
});
