# Stage 1: deps + build
FROM node:22.11.0-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

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
COPY apps/web/ apps/web/

RUN pnpm --filter @equipcare/shared build
RUN pnpm --filter @equipcare/web build

# Stage 2: runtime
FROM node:22.11.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/apps/web/.next ./.next
COPY --from=builder /repo/apps/web/public ./public
COPY --from=builder /repo/apps/web/package.json ./
COPY --from=builder /repo/apps/web/next.config.mjs ./
COPY --from=builder /repo/node_modules ./node_modules

EXPOSE 3000
CMD ["sh", "-c", "pnpm start"]
