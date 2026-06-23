/**
 * Resolve Mermaid `themeVariables` from the live design tokens.
 *
 * Mermaid performs color math on these values, so it needs concrete colors
 * (not `var(--…)` strings). Reading the computed custom properties keeps
 * diagrams in sync with the admin-configured appearance and the active
 * light/dark mode, without hardcoding any color literal.
 */
export function mermaidThemeVariables(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    fontFamily: v('--font-body'),
    primaryColor: v('--color-surface-elevated'),
    primaryTextColor: v('--color-foreground'),
    primaryBorderColor: v('--color-border-strong'),
    lineColor: v('--color-muted'),
    secondaryColor: v('--color-surface-elevated'),
    tertiaryColor: v('--color-surface'),
  };
}
