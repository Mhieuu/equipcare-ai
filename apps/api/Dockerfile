# Stage 1: deps + build
FROM node:22.11.0-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# Copy workspace manifests trước để cache layer
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .nvmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend-core/package.json packages/backend-core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/

RUN pnpm install --frozen-lockfile || pnpm install

# Copy toàn bộ source
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/backend-core/ packages/backend-core/
COPY apps/api/ apps/api/

# Build shared + backend-core trước (dependency)
RUN pnpm --filter @equipcare/shared build
RUN pnpm --filter @equipcare/backend-core build

# Generate Prisma client
RUN pnpm --filter @equipcare/api exec prisma generate

# Build API
RUN pnpm --filter @equipcare/api build
RUN pnpm deploy --filter @equipcare/api --prod /deploy/api || true

# Stage 2: runtime image
FROM node:22.11.0-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/apps/api/dist ./dist
COPY --from=builder /repo/apps/api/prisma ./prisma
COPY --from=builder /repo/apps/api/package.json ./
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages ./packages

EXPOSE 3001
CMD ["node", "dist/main.js"]
