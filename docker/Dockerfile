ARG NODE_IMAGE=node:24-alpine
FROM ${NODE_IMAGE} AS base
ARG NPM_REGISTRY
RUN if [ -n "${NPM_REGISTRY}" ]; then npm config set registry "${NPM_REGISTRY}"; fi
RUN npm install -g pnpm@10.33.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
ARG API_KEY_ENCRYPTION_KEY
ENV API_KEY_ENCRYPTION_KEY=${API_KEY_ENCRYPTION_KEY}
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://localhost:5432/next_wiki
# Generate migrations and OpenAPI spec in parallel; they write to disjoint paths.
RUN pnpm --filter @next-wiki/web exec drizzle-kit generate & \
    pnpm --filter @next-wiki/web openapi:generate & \
    wait
# Mount Next.js build cache so incremental Docker builds reuse previous work.
RUN --mount=type=cache,target=/app/apps/web/.next/cache,id=next-cache-${TARGETARCH} \
    pnpm --filter @next-wiki/web exec next build --webpack

FROM ${NODE_IMAGE} AS runner
RUN apk add --no-cache git openssh-client
RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder /app/apps/web/postcss.config.mjs ./apps/web/postcss.config.mjs
COPY --from=builder /app/apps/web/tailwind.config.ts ./apps/web/tailwind.config.ts
COPY --from=builder /app/apps/web/tsconfig.json ./apps/web/tsconfig.json
COPY --from=builder /app/apps/web/src ./apps/web/src
COPY --from=builder /app/apps/web/app ./apps/web/app
COPY --from=builder /app/packages/shared/src ./packages/shared/src
COPY --from=builder /app/apps/web/src/server/db/migrations ./apps/web/src/server/db/migrations

COPY --from=builder /app/apps/web/scripts ./apps/web/scripts
COPY docker/start.mjs ./start.mjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["node", "start.mjs"]
