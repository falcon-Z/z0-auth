FROM oven/bun:1.3.5-alpine AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS install-prod
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM install AS build
COPY . .
ENV NODE_ENV=production
RUN bun run prisma:generate && bun run build

FROM base AS release
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV BIND_HOST=0.0.0.0
COPY --from=install-prod /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bunfig.toml ./bunfig.toml
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/build.ts ./build.ts
COPY --from=build /app/bun-env.d.ts ./bun-env.d.ts
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/generated ./generated
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/styles ./styles
COPY --from=build /app/assets ./assets
RUN mkdir -p /app/keys && chown -R bun:bun /app
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
