import { describe, it, expect } from "vitest";
import { tokensToCssVars, defaultThemeTokens, DEFAULT_THEME_KEY } from "@next-wiki/shared";
import { contrastRatio, checkThemeAccessibility } from "../../src/server/services/themes/accessibility";

// T040: Theme token application coverage

describe("tokensToCssVars", () => {
  it("maps every top-level token to a CSS custom property", () => {
    const vars = tokensToCssVars(defaultThemeTokens);

    expect(vars["--color-background"]).toBe(defaultThemeTokens.colors.background);
    expect(vars["--color-surface"]).toBe(defaultThemeTokens.colors.surface);
    expect(vars["--color-border"]).toBe(defaultThemeTokens.colors.border);
    expect(vars["--color-text-primary"]).toBe(defaultThemeTokens.colors.text.primary);
    expect(vars["--color-text-secondary"]).toBe(defaultThemeTokens.colors.text.secondary);
    expect(vars["--color-text-muted"]).toBe(defaultThemeTokens.colors.text.muted);
    expect(vars["--color-text-inverse"]).toBe(defaultThemeTokens.colors.text.inverse);
    expect(vars["--color-link"]).toBe(defaultThemeTokens.colors.link.default);
    expect(vars["--color-link-hover"]).toBe(defaultThemeTokens.colors.link.hover);
    expect(vars["--color-link-visited"]).toBe(defaultThemeTokens.colors.link.visited);
  });

  it("generates full primary color scale", () => {
    const vars = tokensToCssVars(defaultThemeTokens);
    for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const) {
      expect(vars[`--color-primary-${shade}`]).toBe(defaultThemeTokens.colors.primary[shade]);
    }
  });

  it("generates typography tokens", () => {
    const vars = tokensToCssVars(defaultThemeTokens);
    expect(vars["--font-family-body"]).toBe(defaultThemeTokens.typography.fontFamily.body);
    expect(vars["--font-size-base"]).toBe(defaultThemeTokens.typography.fontSize.base);
    expect(vars["--font-weight-bold"]).toBe(defaultThemeTokens.typography.fontWeight.bold);
    expect(vars["--line-height-normal"]).toBe(defaultThemeTokens.typography.lineHeight.normal);
  });

  it("generates radius, shadow, and navigation tokens", () => {
    const vars = tokensToCssVars(defaultThemeTokens);
    expect(vars["--radius-md"]).toBe(defaultThemeTokens.radius.md);
    expect(vars["--shadow-sm"]).toBe(defaultThemeTokens.shadow.sm);
    expect(vars["--nav-width"]).toBe(defaultThemeTokens.navigation.width);
    expect(vars["--nav-width-collapsed"]).toBe(defaultThemeTokens.navigation.collapsedWidth);
  });
});

describe("defaultThemeTokens", () => {
  it("has the expected key", () => {
    expect(DEFAULT_THEME_KEY).toBe("default");
  });

  it("passes WCAG AA for primary text on background", () => {
    const ratio = contrastRatio(
      defaultThemeTokens.colors.text.primary,
      defaultThemeTokens.colors.background,
    );
    expect(ratio).not.toBeNull();
    expect(ratio!.passesAA).toBe(true);
  });
});

describe("contrastRatio", () => {
  it("returns null for non-hex inputs", () => {
    expect(contrastRatio("not-a-color", "#ffffff")).toBeNull();
    expect(contrastRatio("#000000", "rgb(255,255,255)")).toBeNull();
  });

  it("returns 1 for identical colors", () => {
    const result = contrastRatio("#3b82f6", "#3b82f6");
    expect(result?.ratio).toBe(1);
    expect(result?.passesAA).toBe(false);
  });

  it("black on white has ratio ≥ 21", () => {
    const result = contrastRatio("#000000", "#ffffff");
    expect(result?.ratio).toBeGreaterThanOrEqual(21);
    expect(result?.passesAAA).toBe(true);
  });

  it("white on white fails all levels", () => {
    const result = contrastRatio("#ffffff", "#ffffff");
    expect(result?.passesAALarge).toBe(false);
  });
});

describe("checkThemeAccessibility", () => {
  it("returns no warnings for the default theme tokens", () => {
    const warnings = checkThemeAccessibility(defaultThemeTokens as unknown as Record<string, unknown>);
    expect(warnings).toHaveLength(0);
  });

  it("returns a warning when text and background are the same color", () => {
    const badTokens = {
      colors: {
        background: "#ffffff",
        surface: "#f8fafc",
        text: { primary: "#ffffff", secondary: "#ffffff", muted: "#ffffff" },
      },
    };
    const warnings = checkThemeAccessibility(badTokens);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("returns empty array when colors key is missing", () => {
    expect(checkThemeAccessibility({})).toHaveLength(0);
  });
});
