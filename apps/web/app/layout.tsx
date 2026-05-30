import type { Metadata } from "next";
import "@/client/styles/globals.css";
import { getActiveThemeTokens } from "@/server/services/themes/theme-service";
import { tokensToCssVars } from "@next-wiki/shared";

export const metadata: Metadata = {
  title: "next-wiki",
  description: "Self-hosted wiki with AI-assisted retrieval",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tokens = await getActiveThemeTokens();
  const cssVars = tokensToCssVars(tokens);
  const cssVarString = Object.entries(cssVars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inject active theme CSS custom properties for SSR */}
        <style dangerouslySetInnerHTML={{ __html: `:root{${cssVarString}}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
