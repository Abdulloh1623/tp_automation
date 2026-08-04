<div align="center">

# POS CRM — TP Automation

**Restoran va fastfud POS uskunalarini sotuvchi/o'rnatuvchi kompaniyaning ichki
boshqaruv tizimi** — mijozlar, obuna/to'lovlar, kunlik qo'ng'iroq jarayoni,
texnik xizmat va omborni bitta tizimda birlashtiradi.

[![CI](https://github.com/Abdulloh1623/tp_automation/actions/workflows/ci.yml/badge.svg)](https://github.com/Abdulloh1623/tp_automation/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-Proprietary-lightgrey)

**Jonli tizim:** [tpautomation.uz](https://tpautomation.uz) · faqat xodimlar uchun, ochiq ro'yxatdan o'tish yo'q

</div>

> Interfeys to'liq **o'zbek tilida (lotin yozuvi)**. Tizim faqat ichki
> foydalanish uchun mo'ljallangan — barcha sahifalar autentifikatsiya ortida,
> mijozga ko'rinadigan qism yo'q. Repozitoriy **xususiy (private)**.

---

## Mundarija

- [Tizim nima qiladi](#tizim-nima-qiladi)
- [Rollar va bo'limlar](#rollar-va-bolimlar)
- [Texnologiyalar](#texnologiyalar)
- [Arxitektura](#arxitektura)
- [Lokal ishga tushirish](#lokal-ishga-tushirish)
- [Muhit sozlamalari](#muhit-sozlamalari)
- [Buyruqlar](#buyruqlar)
- [Testlar va CI](#testlar-va-ci)
- [Loyiha tuzilishi](#loyiha-tuzilishi)
- [Ishlab chiqish jarayoni](#ishlab-chiqish-jarayoni)
- [Deploy](#deploy)
- [Xavfsizlik](#xavfsizlik)
- [Qo'shimcha hujjatlar](#qoshimcha-hujjatlar)

---

## Tizim nima qiladi

| Bo'lim | Tavsif |
| --- | --- |
| **Boshqaruv paneli** | Metrikalar, operator faolligi, daromad va qarzdorlik xulosasi |
| **Kunlik ish** (`/lidlar`) | Operatorning kunlik lidlari; qo'ng'iroq natijasi yoziladi va lid avtomatik to'g'ri navbatga o'tadi. Mijoz nomiga bosilsa — to'liq profil oynasi |
| **Mijozlar** | Ro'yxat (qidiruv/filtr), kartochka, ko'p telefon, tahrirlash, import/eksport |
| **To'lovlar** | Obuna holati, muddati o'tgan/yaqinlashayotgan to'lovlar, karta/QR tasdig'i |
| **Muammolar** | Texnik ticketlar; boshliq usta biriktiradi, holat kuzatiladi |
| **Eskalatsiya / Qaytarish / Otkaz** | Boshliq navbatlari: usta biriktirish, uskuna qaytarish, voz kechgan mijozlar |
| **Ombor / Ustalar** | Inventar, uskuna turlari, ustalarga taqsimlash va harakatlar tarixi |
| **Analitika / Tablo** | Jonli ko'rsatkichlar (avtomatik yangilanuvchi), TV-devor |
| **Moliya** | MRR, churn, qarzdorlik yoshi, "jim churn" (Biznex obunasi tugagan, CRM faol) |
| **Foydalanuvchilar / Audit / Hisobot** | Rol boshqaruvi, to'liq audit jurnali, PDF va Telegram grafikli hisobotlar |

**To'lov qabul qilish:** summa, valyuta, oy soni va to'lov usuli (naqd / Karta /
QR kod) tanlanadi, **chek rasmi majburiy** (yuklash yoki Ctrl+V). Karta/QR
to'lovlari kartaga dostupi bor xodim tasdig'idan o'tgach yozib olinadi; naqd
to'lovda keyingi to'lov sanasi darhol suriladi va chek Telegram to'lovlar
kanaliga yuboriladi.

## Rollar va bo'limlar

| Rol | Kirish | Asosiy vazifa |
| --- | --- | --- |
| **ADMIN** | hammasi | foydalanuvchilar, import, audit, bildirishnomalar, umumiy nazorat |
| **MANAGER** (boshliq) | operatsion bo'limlar | usta biriktirish (eskalatsiya/qaytarish/muammo), ombor, hisobot, moliya |
| **OPERATOR** (TP xodimi) | kunlik ish + kuzatuv | qo'ng'iroqlar, to'lov yozish, usta bilan bog'lanib jarayon yuritish |
| **INSTALLER** (usta) | tizimga kirmaydi | ma'lumot sifatida saqlanadi; boshliq/xodim telefon orqali boshqaradi |

Kirish nazorati uch qatlamda tekshiriladi — Edge middleware, sahifa render va
har bir server action (`src/lib/rbac.ts`, fail-closed: yangi sahifa
`ROUTE_ROLES`ga qo'shilmaguncha hech kimga ochiq bo'lmaydi).

## Texnologiyalar

| Qatlam | Tanlov |
| --- | --- |
| Framework | Next.js 15 (App Router, Server Actions), React 19, TypeScript |
| Baza | PostgreSQL + Prisma 6 — holatlar oddiy string (enum emas), yagona manba `src/lib/constants.ts` |
| UI | Tailwind CSS, yorug'/tungi rejim, to'liq o'zbekcha interfeys |
| Auth | JWT (jose, HS256) + bcryptjs, `httpOnly` cookie, 3 qatlamli RBAC |
| Telegram | grammY bot + node-cron worker (`scripts/bot.ts`, alohida jarayon) |
| Hisobot rasmlari | SVG → PNG (`@resvg/resvg-js`), PDF (`pdf-lib`) |
| Validatsiya | Zod |
| Test | Vitest (unit + integratsion) + Playwright (E2E) |
| Deploy | Docker Compose + GHCR registry (image CI'da quriladi, server faqat `pull`) |

## Arxitektura

```
                    ┌──────────── AWS EC2 (Docker Compose) ────────────┐
Internet ──HTTPS──► │ Caddy (80/443, avto Let's Encrypt)               │
                    │   └─► app    (Next.js, port 3100)   ──┐          │
                    │       worker (bot + cron)            ──┼─► PostgreSQL
                    │       migrate (bir martalik)          ──┘          │
                    └───────────────────────────────────────────────────┘
GitHub main ─► Actions (CI + image build) ─► ghcr.io/abdulloh1623/tp_automation:latest
Serverda yangilash (avtomatik, har 3 daqiqa): git pull && docker compose pull && up -d
```

`app` va `worker` bitta Docker image'dan ishga tushadi (bir xil kod bazasi,
turli entrypoint). To'liq deploy tafsilotlari — [DEPLOY.md](DEPLOY.md).

## Lokal ishga tushirish

Talablar: **Node.js 22+**, **Docker** (PostgreSQL uchun).

```bash
# 1. PostgreSQL (Docker, port 5433)
docker run -d --name tp-postgres -p 5433:5432 \
  -e POSTGRES_USER=tp -e POSTGRES_PASSWORD=PAROL -e POSTGRES_DB=tp_automation postgres:16

# 2. Muhit o'zgaruvchilari
cp .env.example .env        # DATABASE_URL va SESSION_SECRET to'ldiring

# 3. Bog'liqliklar va baza
npm install
npx prisma generate
npm run db:migrate          # migratsiyalarni qo'llash
npm run db:seed             # demo ma'lumotlar — FAQAT lokal, bazani tozalaydi!

# 4. Dev serverni ishga tushirish
npm run dev                 # → http://localhost:3100
```

Seed hisoblari (hammasiga parol `parol123`): `admin` (ADMIN), `boshliq`
(MANAGER), `abdulla` / `javohir` / `biloliddin` / `mehroj` (OPERATOR).

> ⚠️ `npm run bot` ni lokalda ishga tushirmang — bot production'da doimiy
> ishlab turadi; bitta Telegram token bilan ikkita joyda polling qilish
> `409 Conflict` xatosiga olib keladi.

## Muhit sozlamalari

To'liq ro'yxat va izohlar — [`.env.example`](.env.example). Asosiylari:

| O'zgaruvchi | Majburiy | Tavsif |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL ulanish satri |
| `SESSION_SECRET` | ✅ | JWT imzolash kaliti (prodda kuchli, tasodifiy qiymat) |
| `POSTGRES_PASSWORD` | ✅ | Docker PostgreSQL paroli |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | `npm run create-admin` uchun |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_*_CHANNEL_ID` | — | Bot tokeni va kanal ID'lari (bo'sh bo'lsa log rejimi) |
| `DOMAIN` | prodda | Caddy avtomatik HTTPS uchun domen nomi |

## Buyruqlar

| Buyruq | Vazifasi |
| --- | --- |
| `npm run dev` | Dev server (port 3100) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unit testlar, bazasiz) |
| `npm run test:integration` | Server action'lar haqiqiy bazaga qarshi (`.env.test` kerak) |
| `npm run test:e2e` | Playwright (E2E testlar) |
| `npm run db:migrate` | Migratsiya yaratish/qo'llash (dev) |
| `npm run db:deploy` | Migratsiyalarni qo'llash (prod) |
| `npm run db:seed` | Namuna ma'lumotlar (**faqat lokal**, bazani tozalaydi) |
| `npm run create-admin` | Idempotent admin yaratish (bazani tozalamaydi) |
| `npm run bot` | Telegram worker (**faqat production**) |
| `npx prisma studio` | Bazani vizual ko'rish |

## Testlar va CI

```bash
npm run lint && npx tsc --noEmit   # sifat tekshiruvi
npm test                           # Vitest unit testlar
npm run test:e2e                   # Playwright E2E
```

GitHub Actions ikkita job'da ishlaydi: **lint + tsc + test + build** va
**Playwright E2E**. `main`ga to'g'ridan-to'g'ri push qilinmaydi — har PR CI'dan
o'tishi kerak; merge'dan so'ng Docker image avtomatik GHCR'ga quriladi.

## Loyiha tuzilishi

```
prisma/            sxema + migratsiyalar + seed
src/
  middleware.ts     Edge auth gate — har bir non-static so'rovda ishlaydi
  app/(app)/        himoyalangan sahifalar (har papka = bo'lim)
  app/api/          route handler'lar: health, analytics, report/pdf, ...
  actions/          server action'lar — barcha mutatsiyalar shu yerda, rol guard bilan
  components/       UI komponentlar (jadval/karta/filtr/modal)
  lib/              yadro: constants.ts (holatlar manbai), rbac, auth, telegram,
                     billing, reports, distribute-util, validation (zod)
scripts/            bot.ts (worker), create-admin.ts, deploy-pull.sh
e2e/                Playwright testlari
```

> **Status qiymatlari** (holatlar, natijalar, rollar) — `src/lib/constants.ts`
> da yagona manba sifatida boshqariladi. Yangi qiymat qo'shsangiz, Zod
> validatsiyasi va o'zbekcha yorliqlar avtomatik yangilanadi.

## Ishlab chiqish jarayoni

1. `main` dan yangi `feat-*` / `fix-*` branch oching.
2. O'zgarish kiritib, commit qiling va PR yarating.
3. CI yashil bo'lishini kuting (lint → tsc → test → build, hamda E2E).
4. Ko'rikdan so'ng `main`ga merge qiling.

> `main`ga to'g'ridan-to'g'ri push qilinmaydi va yopilmagan CI bilan merge
> qilinmaydi.

## Deploy

Production: **[tpautomation.uz](https://tpautomation.uz)** (Caddy orqali
avtomatik HTTPS, AWS EC2 + Docker Compose).

Har `main`ga push'da Docker image GHCR'ga build va push qilinadi; serverda
avtomatik deploy cron (`deploy-pull.sh`, har 3 daqiqada) `git pull && docker
compose pull && up -d` bajaradi — migratsiyalar `migrate` xizmati orqali
avtomatik qo'llanadi.

> ⚠️ Prod serverda `next build` hech qachon ishlatilmaydi (xotira cheklovi) —
> faqat tayyor GHCR image'dan pull qilinadi.

To'liq qo'llanma, muhit sozlamalari va avariya holatlari — [DEPLOY.md](DEPLOY.md).

## Xavfsizlik

- **Mijoz ma'lumotlari — PII.** `.env`, `uploads/` (cheklar, hujjatlar),
  `backups/` va xom import fayllari git-ignore qilingan; hech qachon commit
  qilinmaydi.
- Production'da `SESSION_SECRET` va boshqa maxfiy kalitlar albatta kuchli,
  tasodifiy qiymatga o'rnatiladi.
- Rollarga asoslangan kirish nazorati (RBAC) uch qatlamda: middleware, sahifa
  va server action darajasida (fail-closed).
- Kunlik shifrlangan PostgreSQL backup Telegram backup kanaliga yuboriladi.

## Qo'shimcha hujjatlar

| Fayl | Mazmuni |
| --- | --- |
| [AI_CONTEXT.md](AI_CONTEXT.md) | To'liq texnik kontekst (arxitektura, data model, ish oqimlari) — AI/agentlar uchun, inglizcha |
| [DEPLOY.md](DEPLOY.md) | Production deploy qo'llanmasi |
| [README-LOCAL.md](README-LOCAL.md) | Lokal ishga tushirishning qo'shimcha tafsilotlari |
</content>
