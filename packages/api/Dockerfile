# ─── Builder ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

WORKDIR /app

# Copy workspace manifests first for optimal layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/probes/package.json ./packages/probes/
COPY packages/api/package.json ./packages/api/
COPY packages/dashboard/package.json ./packages/dashboard/

# Install all deps (including devDeps needed for tsc).
RUN pnpm install --frozen-lockfile --filter @sui-scope/api

# Copy source and compile.
COPY packages/api/ ./packages/api/
COPY config/ ./config/
RUN pnpm --filter @sui-scope/api run build

# ─── Production ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS production

RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

WORKDIR /app

# Copy workspace manifests for production install.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/probes/package.json ./packages/probes/
COPY packages/api/package.json ./packages/api/
COPY packages/dashboard/package.json ./packages/dashboard/

# Install production deps only (no devDeps).
RUN pnpm install --frozen-lockfile --filter @sui-scope/api --prod

# Copy compiled JS output from builder.
COPY --from=builder /app/packages/api/dist ./packages/api/dist
# Copy provider registry — needed at runtime.
COPY --from=builder /app/config ./config

# Run as non-root for security.
RUN addgroup -S suiscope && adduser -S suiscope -G suiscope
USER suiscope

EXPOSE 3000

CMD ["node", "packages/api/dist/index.js"]
