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
# next build evaluates config.ts (Zod-validated env) during page data
# collection. A placeholder key satisfies validation at build time; the real
# key is injected at runtime via the API_KEY_ENCRYPTION_KEY env var.
ENV API_KEY_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://localhost:5432/next_wiki
# Generate migrations and OpenAPI spec in parallel; they write to disjoint paths.
RUN pnpm --filter @next-wiki/web exec drizzle-kit generate & \
    pnpm --filter @next-wiki/web openapi:generate & \
    wait
# Static site publishing (031) serves a stylesheet and client runtime that do
# not vary with wiki content, so they are built once here rather than on every
# publish. This must run explicitly: the image invokes `next build` directly
# rather than through Turborepo, so the task graph's dependency on it does not
# apply. The output lands in apps/web/public/ and is copied to the runner with
# the rest of that directory.
RUN pnpm --filter @next-wiki/web build:static-site-assets
# Mount Next.js build cache so incremental Docker builds reuse previous work.
RUN --mount=type=cache,target=/app/apps/web/.next/cache,id=next-cache-${TARGETARCH} \
    pnpm --filter @next-wiki/web exec next build --webpack

FROM ${NODE_IMAGE} AS runner
RUN apk add --no-cache git openssh-client

# Static site publishing (031) builds its reader-facing search index with
# Pagefind. It runs only during a publish: a deployment that never publishes
# never executes it, and it adds no service and no setup step. Pinned and
# checksum-verified; the musl build matches this Alpine base, and 1.5.2 is
# after the release that restored musl indexing throughput.
# PAGEFIND_BASE_URL allows an internal mirror where GitHub is unreachable.
ARG TARGETARCH
ARG PAGEFIND_VERSION=1.5.2
ARG PAGEFIND_BASE_URL=https://github.com/Pagefind/pagefind/releases/download
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) pagefind_arch='x86_64' ;; \
      arm64) pagefind_arch='aarch64' ;; \
      *) echo "unsupported TARGETARCH for pagefind: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    archive="pagefind_extended-v${PAGEFIND_VERSION}-${pagefind_arch}-unknown-linux-musl.tar.gz"; \
    cd /tmp; \
    wget -q "${PAGEFIND_BASE_URL}/v${PAGEFIND_VERSION}/${archive}"; \
    wget -q "${PAGEFIND_BASE_URL}/v${PAGEFIND_VERSION}/${archive}.sha256"; \
    sha256sum -c "${archive}.sha256"; \
    tar -xzf "${archive}" -C /usr/local/bin pagefind_extended; \
    chmod +x /usr/local/bin/pagefind_extended; \
    rm -f "${archive}" "${archive}.sha256"; \
    pagefind_extended --version

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
