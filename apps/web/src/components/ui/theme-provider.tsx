"use client";

import { useEffect } from "react";

interface ThemeProviderProps {
  /** CSS custom property map, e.g. { "--color-background": "#fff" } */
  cssVars: Record<string, string>;
  children: React.ReactNode;
}

/**
 * Applies theme CSS custom properties to the document root.
 * Used for live preview in the theme editor; the active site theme
 * is injected server-side via a <style> tag in the root layout.
 */
export function ThemeProvider({ cssVars, children }: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(cssVars)) {
      root.style.setProperty(name, value);
    }
    return () => {
      for (const name of Object.keys(cssVars)) {
        root.style.removeProperty(name);
      }
    };
  }, [cssVars]);

  return <>{children}</>;
}
