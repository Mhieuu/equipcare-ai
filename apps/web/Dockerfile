# =============================================================================
# Web (Next.js) — multi-stage build
#
# Stage 1 (builder): cài deps, build shared + web (next build).
# Stage 2 (runner): `pnpm deploy` cho layout production portable + .next.
#
# Vì sao dùng `pnpm deploy` thay vì copy /repo/node_modules:
#   pnpm dùng symlink trỏ tới store nội bộ với đường dẫn tuyệt đối → copy
#   nguyên si sang image khác sẽ hỏng (`next: command not found`).
#   `pnpm deploy` sinh node_modules đã resolve sẵn → chạy được ở mọi nơi.
# =============================================================================
FROM node:22.11.0-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# URL API mà trình duyệt gọi. Giá trị này được inline vào bundle lúc build,
# nhưng route handler /api/runtime-config đọc lại từ env lúc runtime nên vẫn
# sửa được mà không cần build lại (xem docs/… §13.6).
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# --- Manifests trước để cache layer ---
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .nvmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend-core/package.json packages/backend-core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# --ignore-scripts: xem apps/api/Dockerfile để biết lý do.
RUN pnpm install --frozen-lockfile --ignore-scripts || pnpm install --ignore-scripts

# --- Source ---
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/backend-core/ packages/backend-core/
# backend-core build gọi `prisma generate` → cần schema.prisma của apps/api.
COPY apps/api/prisma/ apps/api/prisma/
COPY apps/web/ apps/web/

RUN pnpm --filter @equipcare/shared build
RUN pnpm --filter @equipcare/backend-core build
RUN pnpm --filter @equipcare/web build

# Đóng gói bản production (node_modules portable + .next đã build)
RUN pnpm --filter @equipcare/web deploy --prod /deploy/web

# =============================================================================
FROM node:22.11.0-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `pnpm deploy` đã gói sẵn node_modules + package.json + .next
COPY --from=builder /deploy/web ./

# Dọn file không cần trong runtime image (source, test e2e, log runtime).
RUN rm -rf src e2e \
    && rm -f *.log *.err *.tsbuildinfo

EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
