# ─────────────────────────────────────────────────────────────────────────────
# Z0 Auth – Dockerfile
#
# Multi-stage build:
#   deps    – install production + dev dependencies
#   builder – generate the Prisma client
#   runner  – final lean image that runs the Bun server
#
# The Bun runtime handles JSX/TSX compilation and static-asset bundling at
# serve time (via its native HTML-routing feature), so no separate front-end
# build step is required.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./

# Install all dependencies (including devDeps needed by bun-plugin-tailwind)
RUN bun install --frozen-lockfile

# ── Stage 2: generate Prisma client ──────────────────────────────────────────
FROM deps AS builder

COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN bunx prisma generate

# ── Stage 3: production runner ────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy installed node_modules from builder (includes @prisma/client etc.)
COPY --from=builder /app/node_modules ./node_modules

# Copy the Prisma-generated JS client (output = "../generated/prisma" in schema)
COPY --from=builder /app/generated ./generated

# Copy application source
COPY . .

# Ensure the native Prisma binary for the current platform is correct.
# (The one in node_modules/.prisma is already included via node_modules above,
# but we overwrite it explicitly in case the COPY . . above shadowed anything.)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Expose the default Bun serve port
EXPOSE 3000

# Apply pending migrations then start the server.
# Migration files are committed to source control (prisma/migrations/).
# SIGTERM / SIGINT are forwarded by sh and handled by the app for graceful shutdown.
CMD ["sh", "-c", "bunx prisma migrate deploy && bun src/server.ts"]
