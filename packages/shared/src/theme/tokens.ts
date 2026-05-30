// Design token schema — zero runtime dependencies, pure type/constant definitions.

export type ColorScale = {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
};

export type ThemeTokens = {
  colors: {
    primary: ColorScale;
    neutral: ColorScale;
    success: ColorScale;
    warning: ColorScale;
    danger: ColorScale;
    // Semantic aliases
    background: string;
    surface: string;
    border: string;
    text: {
      primary: string;
      secondary: string;
      muted: string;
      inverse: string;
    };
    link: {
      default: string;
      hover: string;
      visited: string;
    };
  };
  typography: {
    fontFamily: {
      body: string;
      heading: string;
      mono: string;
    };
    fontSize: {
      xs: string;
      sm: string;
      base: string;
      lg: string;
      xl: string;
      "2xl": string;
      "3xl": string;
      "4xl": string;
    };
    fontWeight: {
      normal: string;
      medium: string;
      semibold: string;
      bold: string;
    };
    lineHeight: {
      tight: string;
      snug: string;
      normal: string;
      relaxed: string;
    };
  };
  spacing: {
    unit: string; // base unit, e.g. "4px" or "0.25rem"
  };
  radius: {
    sm: string;
    md: string;
    lg: string;
    full: string;
  };
  shadow: {
    sm: string;
    md: string;
    lg: string;
  };
  navigation: {
    width: string;
    collapsedWidth: string;
  };
};

// CSS custom property name for each token path
export type CssVar =
  | "--color-primary-500"
  | "--color-background"
  | "--color-surface"
  | "--color-border"
  | "--color-text-primary"
  | "--color-text-secondary"
  | "--color-text-muted"
  | "--color-link"
  | "--font-family-body"
  | "--font-family-heading"
  | "--font-family-mono"
  | "--font-size-base"
  | "--nav-width"
  | string;

export type CssVarMap = Record<CssVar, string>;

export function tokensToCssVars(tokens: ThemeTokens): CssVarMap {
  const vars: CssVarMap = {};

  // Colors
  const { colors, typography, spacing, radius, shadow, navigation } = tokens;

  for (const [shade, value] of Object.entries(colors.primary)) {
    vars[`--color-primary-${shade}`] = value;
  }
  for (const [shade, value] of Object.entries(colors.neutral)) {
    vars[`--color-neutral-${shade}`] = value;
  }
  for (const [shade, value] of Object.entries(colors.success)) {
    vars[`--color-success-${shade}`] = value;
  }
  for (const [shade, value] of Object.entries(colors.warning)) {
    vars[`--color-warning-${shade}`] = value;
  }
  for (const [shade, value] of Object.entries(colors.danger)) {
    vars[`--color-danger-${shade}`] = value;
  }

  vars["--color-background"] = colors.background;
  vars["--color-surface"] = colors.surface;
  vars["--color-border"] = colors.border;
  vars["--color-text-primary"] = colors.text.primary;
  vars["--color-text-secondary"] = colors.text.secondary;
  vars["--color-text-muted"] = colors.text.muted;
  vars["--color-text-inverse"] = colors.text.inverse;
  vars["--color-link"] = colors.link.default;
  vars["--color-link-hover"] = colors.link.hover;
  vars["--color-link-visited"] = colors.link.visited;

  // Typography
  vars["--font-family-body"] = typography.fontFamily.body;
  vars["--font-family-heading"] = typography.fontFamily.heading;
  vars["--font-family-mono"] = typography.fontFamily.mono;

  for (const [size, value] of Object.entries(typography.fontSize)) {
    vars[`--font-size-${size}`] = value;
  }
  for (const [weight, value] of Object.entries(typography.fontWeight)) {
    vars[`--font-weight-${weight}`] = value;
  }
  for (const [height, value] of Object.entries(typography.lineHeight)) {
    vars[`--line-height-${height}`] = value;
  }

  // Spacing, radius, shadow, navigation
  vars["--spacing-unit"] = spacing.unit;
  vars["--radius-sm"] = radius.sm;
  vars["--radius-md"] = radius.md;
  vars["--radius-lg"] = radius.lg;
  vars["--radius-full"] = radius.full;
  vars["--shadow-sm"] = shadow.sm;
  vars["--shadow-md"] = shadow.md;
  vars["--shadow-lg"] = shadow.lg;
  vars["--nav-width"] = navigation.width;
  vars["--nav-width-collapsed"] = navigation.collapsedWidth;

  return vars;
}
