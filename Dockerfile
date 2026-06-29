# TP Automation — bitta image (app + worker + migratsiya uchun ishlatiladi).
# App:      npm run start   (default CMD)
# Worker:   npm run bot     (docker-compose'da command bilan)
# Migrate:  npm run db:deploy

# ---- Builder: to'liq bog'liqliklar bilan quradi ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- Runner: faqat prod bog'liqliklar (vitest/playwright/eslint yo'q) ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Asia/Tashkent

# openssl — Prisma uchun; postgresql-client-16 — worker pg_dump backup uchun (server pg16);
# curl — healthcheck uchun.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl gnupg \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Build natijasi va runtime uchun zarur fayllar
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Prisma client (prod node_modules ichida) generatsiya qilinadi
RUN npx prisma generate

EXPOSE 3100
CMD ["npm", "run", "start"]
