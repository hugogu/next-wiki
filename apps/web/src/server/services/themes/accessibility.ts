// Zero-runtime-dependency WCAG 2.1 contrast ratio helpers.

export type ContrastResult = {
  ratio: number;
  passesAA: boolean;       // 4.5:1 — normal text
  passesAALarge: boolean;  // 3.0:1 — large text (≥18pt or 14pt bold)
  passesAAA: boolean;      // 7.0:1 — enhanced
};

export type AccessibilityWarning = {
  pair: string;
  ratio: number;
};

function hexToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const r = parseInt(m[1]!.slice(0, 2), 16);
  const g = parseInt(m[1]!.slice(2, 4), 16);
  const b = parseInt(m[1]!.slice(4, 6), 16);
  return 0.2126 * hexToLinear(r) + 0.7152 * hexToLinear(g) + 0.0722 * hexToLinear(b);
}

export function contrastRatio(fg: string, bg: string): ContrastResult | null {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  if (l1 === null || l2 === null) return null;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
  return {
    ratio,
    passesAA: ratio >= 4.5,
    passesAALarge: ratio >= 3.0,
    passesAAA: ratio >= 7.0,
  };
}

export function checkThemeAccessibility(tokenSet: Record<string, unknown>): AccessibilityWarning[] {
  const warnings: AccessibilityWarning[] = [];
  const colors = (tokenSet as { colors?: Record<string, unknown> })?.colors;
  if (!colors) return warnings;

  const bg = colors.background as string | undefined;
  const surface = colors.surface as string | undefined;
  const text = colors.text as Record<string, string> | undefined;
  if (!bg || !text) return warnings;

  const pairs: [string, string, string][] = [
    ["text.primary / background", text.primary, bg],
    ["text.secondary / background", text.secondary, bg],
    ["text.muted / background", text.muted, bg],
    ...(surface
      ? ([["text.primary / surface", text.primary, surface]] as [string, string, string][])
      : []),
  ];

  for (const [pair, fg, bgColor] of pairs) {
    if (!fg || !bgColor) continue;
    const result = contrastRatio(fg, bgColor);
    if (result && !result.passesAALarge) {
      warnings.push({ pair, ratio: result.ratio });
    }
  }
  return warnings;
}
