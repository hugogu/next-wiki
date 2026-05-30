import type { Metadata } from "next";
import "@/client/styles/globals.css";

export const metadata: Metadata = {
  title: "next-wiki",
  description: "Self-hosted wiki with AI-assisted retrieval",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  );
}
