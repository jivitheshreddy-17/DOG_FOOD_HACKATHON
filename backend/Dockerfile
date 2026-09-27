# ─────────────────────────────────────────────────────────────────────────────
# Backend Dockerfile — Node.js 20 LTS + Fastify + Prisma
# Build context is MODULE-1_T1/ (set in docker-compose.yml).
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install all dependencies (including devDeps for build) ───────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma engine compatibility
RUN apk add --no-cache openssl

# Copy package manifests first for layer caching
COPY backend/package*.json ./

# Copy local contracts package so npm ci can resolve the file: dependency
COPY backend/src/contracts ./src/contracts

# Install ALL dependencies (devDeps needed for tsc + prisma generate)
RUN npm ci

# Copy the full backend source
COPY backend/ .

# Generate Prisma client (baked into node_modules)
RUN npx prisma generate

# Compile TypeScript → dist/
RUN npx tsc --project src/contracts/tsconfig.json
RUN npx tsc --project tsconfig.json

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# wget is used by the health check, openssl is required for Prisma engines
RUN apk add --no-cache openssl wget

ENV NODE_ENV=production

# Runtime artifacts from builder
COPY --from=builder /app/dist          ./dist
COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/src/contracts ./src/contracts
COPY --from=builder /app/prisma        ./prisma
COPY --from=builder /app/package.json  ./package.json

EXPOSE 3001

# On every container start:
#  1. Push schema to postgres (idempotent on re-runs)
#  2. Run the seeder (idempotent — all writes are upserts)
#  3. Start the Fastify server
CMD ["sh", "-c", \
  "npx prisma db push --accept-data-loss && \
   node dist/prisma/seed.js && \
   node dist/src/index.js"]
