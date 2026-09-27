# ─────────────────────────────────────────────────────────────────────────────
# Frontend Dockerfile — Next.js 14 (App Router, standalone output)
# Build context is ./frontend (set in docker-compose.yml).
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

# ── Stage 2: Build Next.js ────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Provide a build-time BACKEND_URL so next.config.js rewrites compile cleanly.
# The value is overridden at runtime by the environment variable.
ENV BACKEND_URL=http://backend:3001
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js standalone output bundles everything needed to run the server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static     ./.next/static
COPY --from=builder /app/public           ./public

EXPOSE 3000

# next.config.js output: "standalone" generates server.js at the root
CMD ["node", "server.js"]
