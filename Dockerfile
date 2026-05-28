FROM node:24-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.json tsconfig.base.json ./

# All packages needed to build
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY scripts/ ./scripts/

RUN pnpm install --frozen-lockfile

# Build composite libs then the API server
RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/api-server run build

# ── Production image ───────────────────────────────────────────────────────
FROM node:24-slim AS production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/tsconfig.base.json ./
COPY --from=builder /app/lib/ ./lib/
COPY --from=builder /app/artifacts/api-server/ ./artifacts/api-server/

RUN pnpm install --frozen-lockfile --prod

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
