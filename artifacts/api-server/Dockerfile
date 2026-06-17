FROM node:24-alpine AS builder
RUN npm install -g pnpm@10
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.json tsconfig.base.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

RUN pnpm install --no-frozen-lockfile
RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/api-server run build

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/artifacts/api-server/dist ./dist
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
