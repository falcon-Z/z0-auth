# Use official Bun image
FROM oven/bun:1.2.15-alpine AS base
WORKDIR /app

# Install dependencies stage
FROM base AS dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Build stage
FROM base AS build
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run prisma:generate
RUN bun run build

# Production stage
FROM base AS production
ENV NODE_ENV=production

# Copy dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy Prisma client
COPY --from=build /app/generated ./generated
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# Copy source code
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY package.json ./

# Create keys directory for JWT keys
RUN mkdir -p /app/keys

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

# Start the application
CMD ["bun", "run", "start"]
