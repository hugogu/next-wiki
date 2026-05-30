import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",

  // Transpile workspace packages.
  transpilePackages: ["@next-wiki/shared", "@next-wiki/editor"],

  experimental: {
    // Enable React Server Components optimizations.
    serverComponentsExternalPackages: [
      "pg",
      "pg-boss",
      "better-auth",
      "drizzle-orm",
    ],
  },

  // Security headers.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
