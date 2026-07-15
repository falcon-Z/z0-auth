# syntax=docker/dockerfile:1
FROM oven/bun:1.3.14-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json bunfig.toml components.json ./
COPY src ./src
RUN bun run build

FROM oven/bun:1.3.14-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    BIND_ADDRESS=0.0.0.0

WORKDIR /app

COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --from=build --chown=bun:bun /app/src/scripts/db-migrate.ts /app/src/scripts/migrations.ts ./src/scripts/
COPY --from=build --chown=bun:bun /app/src/scripts/sql/migrations ./src/scripts/sql/migrations
COPY --from=build --chown=bun:bun /app/src/api/lib/create-pg-sql.ts /app/src/api/lib/config.ts ./src/api/lib/
COPY --chown=bun:bun docker/entrypoint.sh /usr/local/bin/z0-auth-entrypoint

RUN chmod 0755 /usr/local/bin/z0-auth-entrypoint

USER bun
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["bun", "-e", "const r=await fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/api/ready');process.exit(r.ok?0:1)"]

ENTRYPOINT ["/usr/local/bin/z0-auth-entrypoint"]
