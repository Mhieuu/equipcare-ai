# Stage 1: deps + build
FROM node:22.11.0-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .nvmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend-core/package.json packages/backend-core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/

RUN pnpm install --frozen-lockfile || pnpm install

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/backend-core/ packages/backend-core/
COPY apps/worker/ apps/worker/

RUN pnpm --filter @equipcare/shared build
RUN pnpm --filter @equipcare/backend-core build
RUN pnpm --filter @equipcare/worker build

# Stage 2: runtime
FROM node:22.11.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/apps/worker/dist ./dist
COPY --from=builder /repo/apps/worker/package.json ./
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages ./packages

CMD ["node", "dist/main.js"]
