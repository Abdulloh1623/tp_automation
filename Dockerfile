# TP Automation — bitta image (app + worker + migratsiya uchun ishlatiladi).
# App:      npm run start   (default CMD)
# Worker:   npm run bot     (docker-compose'da command bilan)
# Migrate:  npm run db:deploy
#
# HAJM. Har deploy yangi teg bilan serverga tushadi, shuning uchun image hajmi
# to'g'ridan-to'g'ri disk bosimi demak (2026-07-26 da 23 ta eski image 34 GB
# egallab diskni to'ldirgan). Shu sabab bu yerda ataylab tozalanadi:
#   - `.next/cache` (~470MB) builder'da o'chiriladi;
#   - npm keshi o'rnatish bilan BIR qatlamda tozalanadi;
#   - gnupg pgdg kalitidan keyin olib tashlanadi.
# Next'ning `output: "standalone"` rejimi ISHLATILMAYDI: worker `tsx` orqali
# `src/`dagi TypeScript'ni ishlatadi, ya'ni to'liq `node_modules` baribir kerak —
# standalone qo'shilsa hajm kamaymay, ikkilanib ketardi.

# ---- Builder: to'liq bog'liqliklar bilan quradi ----
# Node 22 LTS (Jod). 22.15+ da Node webstreams'dagi TransformStream race tuzatilgan:
# streaming SSR (React 19) paytida mijoz ulanishni uzsa "controller[kState].
# transformAlgorithm is not a function" otilardi. To'liq versiyaga pin (reproducible;
# Dependabot yangilaydi).
FROM node:22.23.1-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# patches/ postinstall'dan (patch-package) OLDIN kerak — Next parallel-route
# flight crash tuzatmasi (walk-tree undefined slot; Next #73362) shu yerdan qo'llanadi.
COPY patches ./patches
RUN npm ci
COPY . .
# `.next/cache` — webpack/SWC qurilish keshi (~470MB). Runtime'ga KERAK EMAS,
# lekin `COPY .next` uni ham olib ketardi va image'ni uchdan bir baravar
# shishirardi. Shu bosqichda o'chiramiz (builder qatlami final image'ga kirmaydi).
RUN npx prisma generate && npm run build && rm -rf .next/cache

# ---- Runner: faqat prod bog'liqliklar (vitest/playwright/eslint yo'q) ----
FROM node:22.23.1-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Asia/Tashkent

# openssl — Prisma uchun; postgresql-client-16 — worker pg_dump backup uchun (server pg16);
# curl — healthcheck uchun; fontconfig + DejaVu — hisobot rasmlari (resvg) matni uchun
# (slim image'da shrift YO'Q — bo'lmasa chart'lar matnsiz "bo'sh" chiqadi).
# gnupg faqat pgdg kalitini qo'shish uchun kerak — o'rnatish tugagach olib
# tashlanadi (image'da qolsa ~30MB bekorga turadi). curl QOLADI: app
# konteynerining healthcheck'i uni ishlatadi.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl gnupg fontconfig fonts-dejavu-core \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && apt-get purge -y gnupg \
  && apt-get autoremove -y \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /usr/share/doc/* /usr/share/man/*

COPY package.json package-lock.json ./
# Runner node_modules'i `next start` runtime'da yuklanadi — patch AYNAN shu yerda
# qo'llanishi shart (builder'niki emas). patch-package prod dependency, --omit=dev
# bilan ham mavjud; postinstall patches/ ni qo'llaydi.
COPY patches ./patches
# `npm cache clean` AYNI qatlamda: npm ci yuklab olgan tarball keshi (~150MB)
# alohida RUN'da o'chirilsa qatlamda qolib ketardi (Docker qatlamlari immutable).
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Build natijasi va runtime uchun zarur fayllar
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Prisma client (prod node_modules ichida) generatsiya qilinadi.
# Prisma engine yuklab olish keshi (~/.cache/prisma) generatsiyadan keyin
# kerak emas — engine allaqachon node_modules ichida.
RUN npx prisma generate && rm -rf /root/.cache /root/.npm /tmp/*

# Root'da ishlamaymiz: konteyner ichidagi biror zaiflik darhol root huquqini
# bermasin. `uploads` va `backups` — volume mount nuqtalari, shu bois oldindan
# yaratib, egaligini beramiz (aks holda ilova ularga yoza olmaydi).
# DIQQAT: `chown -R node:node /app` QILMAYMIZ. Docker qatlamlari immutable —
# faqat egalik o'zgarsa ham HAR BIR fayl yangi qatlamga qaytadan yoziladi,
# ya'ni butun `node_modules` + `.next` ikkilanadi (o'lchandi: image 1668 MB,
# shundan ~800 MB aynan shu nusxa). node foydalanuvchisiga faqat YOZISH kerak
# bo'lgan kataloglar beriladi; qolganini u baribir o'qiy oladi.
RUN mkdir -p /app/uploads /app/backups /app/.next/cache \
  && chown node:node /app \
  && chown -R node:node /app/uploads /app/backups /app/.next
USER node

EXPOSE 3100
CMD ["npm", "run", "start"]
