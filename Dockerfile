# Imagem de produção do LJC System (Next.js + PostgreSQL)
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 TZ=America/Maceio PORT=3000
RUN useradd --system --uid 1001 ljc && mkdir -p /app/storage && chown ljc /app/storage
COPY --from=build --chown=ljc /app ./
USER ljc
EXPOSE 3000
# Aplica as migrations e sobe o servidor.
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && npx next start -p ${PORT}"]
