ARG NODE_IMAGE=node:24-alpine
FROM ${NODE_IMAGE} AS base
RUN npm install -g pnpm@10.33.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://localhost:5432/next_wiki
RUN pnpm --filter @next-wiki/web exec drizzle-kit generate
RUN pnpm --filter @next-wiki/web build

FROM ${NODE_IMAGE} AS runner
RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder /app/apps/web/postcss.config.mjs ./apps/web/postcss.config.mjs
COPY --from=builder /app/apps/web/tailwind.config.ts ./apps/web/tailwind.config.ts
COPY --from=builder /app/apps/web/tsconfig.json ./apps/web/tsconfig.json
COPY --from=builder /app/apps/web/src ./apps/web/src
COPY --from=builder /app/apps/web/app ./apps/web/app
COPY --from=builder /app/packages/shared/src ./packages/shared/src
COPY --from=builder /app/apps/web/src/server/db/migrations ./apps/web/src/server/db/migrations

COPY docker/package.json ./migrate/package.json
RUN cd migrate && npm install --no-package-lock --omit=dev
COPY docker/migrate.mjs ./migrate/migrate.mjs
COPY docker/start.mjs ./start.mjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["node", "start.mjs"]
