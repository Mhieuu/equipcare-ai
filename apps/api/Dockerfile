# =============================================================================
# API (NestJS) — multi-stage build
#
# Stage 1 (builder): cài deps, build shared + backend-core + api, rồi dùng
#   `pnpm deploy` để tạo layout production HOÀN CHỈNH, portable (node_modules
#   dạng flat, không phải symlink trỏ tới /repo).
#
# Stage 2 (runner): chỉ copy phần đã deploy + code đã build.
#
# Vì sao KHÔNG copy thẳng /repo/node_modules:
#   pnpm dùng symlink tới store nội bộ (node_modules/.pnpm) với đường dẫn
#   tuyệt đối. Copy nguyên si sang image khác → symlink hỏng → các lệnh
#   như `prisma`, `tsx` không chạy được ("command not found").
#   `pnpm deploy` sinh ra node_modules đã resolve sẵn → chạy được ở mọi nơi.
# =============================================================================
FROM node:22.11.0-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# --- Manifests trước để cache layer ---
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .nvmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend-core/package.json packages/backend-core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Cài dependency.
# --ignore-scripts: postinstall của repo gọi `prisma generate`, nhưng
# schema.prisma chưa được COPY ở layer này (chỉ mới copy package.json) →
# postinstall sẽ fail. Prisma client được generate ở layer build bên dưới.
RUN pnpm install --frozen-lockfile --ignore-scripts || pnpm install --ignore-scripts

# --- Source ---
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/backend-core/ packages/backend-core/
COPY apps/api/ apps/api/

# Build theo thứ tự phụ thuộc
RUN pnpm --filter @equipcare/shared build
RUN pnpm --filter @equipcare/backend-core build
RUN pnpm --filter @equipcare/api exec prisma generate
RUN pnpm --filter @equipcare/api build

# Đóng gói bản production (node_modules portable + dist + prisma schema)
RUN pnpm --filter @equipcare/api deploy --prod /deploy/api

# =============================================================================
FROM node:22.11.0-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV NODE_ENV=production

# `pnpm deploy` đã gói sẵn node_modules + package.json.
# LƯU Ý: `pnpm deploy` KHÔNG copy `dist/` (dist bị .gitignore nên pnpm loại bỏ),
# nên phải copy tay từ builder.
COPY --from=builder /deploy/api ./
COPY --from=builder /repo/apps/api/dist ./dist

# Prisma CLI cần schema + migrations (dùng cho `migrate deploy` khi deploy)
COPY --from=builder /repo/apps/api/prisma ./prisma

# Dọn file không cần trong runtime image (source, test, log runtime).
# Giữ image gọn và tránh lộ source code khi ai đó exec vào container.
RUN rm -rf src test tools \
    && rm -f *.log *.err *.tsbuildinfo tsconfig.json \
    && rm -rf e2e

EXPOSE 3001
CMD ["node", "dist/main.js"]
