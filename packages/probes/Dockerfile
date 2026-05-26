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
RUN pnpm install --frozen-lockfile --filter @sui-scope/probes

# Copy source and compile.
COPY packages/probes/ ./packages/probes/
RUN pnpm --filter @sui-scope/probes run build

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
RUN pnpm install --frozen-lockfile --filter @sui-scope/probes --prod

# Copy compiled JS output from builder.
COPY --from=builder /app/packages/probes/dist ./packages/probes/dist

# Copy proto definitions (loaded at runtime by @grpc/proto-loader).
COPY packages/probes/proto ./packages/probes/proto

# Copy provider registry (read at startup by config loader).
COPY config ./config

# Run as non-root for security.
RUN addgroup -S suiscope && adduser -S suiscope -G suiscope
USER suiscope

CMD ["node", "packages/probes/dist/index.js"]
