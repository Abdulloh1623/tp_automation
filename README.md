# POS CRM — TP Automation

Restoran, kafe va fastfud shoxobchalari uchun **POS dasturi hamda monoblok
terminallarini** sotadigan va o'rnatadigan kompaniyaning ichki boshqaruv tizimi.
Tizim mijozlar bazasi, obuna/to'lovlar, kunlik qo'ng'iroq jarayoni, texnik
muammolar va omborni bir joyda birlashtiradi.

Interfeys to'liq **o'zbek tilida (lotin yozuvi)**. Tizim faqat ichki foydalanish
uchun mo'ljallangan — barcha sahifalar autentifikatsiya ortida, ochiq/mijozga
ko'rinadigan qism yo'q.

---

## Asosiy imkoniyatlar

| Bo'lim | Tavsif |
| --- | --- |
| **Boshqaruv paneli** | Metrikalar, operator faolligi, daromad va qarzdorlik xulosasi |
| **Kunlik ish** | Operatorning kunlik lidlari; qo'ng'iroq natijasi yoziladi va lid avtomatik to'g'ri navbatga o'tadi. Mijoz nomiga bosilsa — to'liq ma'lumot oynasi |
| **Mijozlar** | Ro'yxat (qidiruv/filtr), kartochka, ko'p telefon, tahrirlash |
| **To'lovlar** | Obuna holati, muddati o'tgan va yaqinlashayotgan to'lovlar |
| **Muammolar** | Texnik ticketlar; boshliq integrator (usta) biriktiradi, holat kuzatiladi |
| **Eskalatsiya / Qaytarish / Otkaz** | Boshliq navbatlari: usta biriktirish, uskuna qaytarish, voz kechgan mijozlar |
| **Ombor** | Inventar, uskuna turlari va harakatlari |
| **Analitika / Tablo** | Jonli ko'rsatkichlar (avtomatik yangilanuvchi) |
| **Foydalanuvchilar / Audit / Hisobot** | Rol boshqaruvi, to'liq audit jurnali, PDF hisobot |

**To'lov qabul qilish:** summa, valyuta, oy soni va to'lov usuli (Karta / QR kod)
tanlanadi, **chek rasmi majburiy** (yuklash yoki Ctrl+V). Qabuldan so'ng keyingi
to'lov sanasi avtomatik suriladi va ma'lumot chek rasmi bilan Telegram to'lovlar
kanaliga yuboriladi.

---

## Texnologiyalar

- **Next.js 15** — App Router, React 19, Server Actions, TypeScript
- **Prisma 6** + **PostgreSQL**
- **Tailwind CSS** (yorug'/tungi rejim)
- **jose** (JWT cookie) + **bcryptjs** — autentifikatsiya
- **grammY** + **node-cron** — Telegram bot, eslatmalar, backup
- **pdf-lib** + **@resvg/resvg-js** — PDF hisobotlar
- **zod** — validatsiya · **Vitest** + **Playwright** — testlar
- **Docker Compose** + AWS EC2 + GHCR — deploy

---

## Ishga tushirish (lokal)

Talablar: **Node.js 22+**, **Docker** (PostgreSQL uchun).

```bash
# 1. Bog'liqliklarni o'rnatish
npm ci

# 2. Prisma clientni generatsiya qilish
npx prisma generate

# 3. Bazani yaratish va migratsiya qilish
npm run db:migrate

# 4. Namuna ma'lumotlar (foydalanuvchilar, uskuna turlari)
npm run db:seed

# 5. Dev serverni ishga tushirish
npm run dev            # → http://localhost:3100
```

Ixtiyoriy — Telegram bot va rejalashtirilgan vazifalar (alohida jarayon):

```bash
npm run bot
```

### Muhit sozlamalari (`.env`)

| O'zgaruvchi | Majburiy | Tavsif |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL ulanish satri |
| `SESSION_SECRET` | ✅ | JWT imzolash kaliti (prodda kuchli qiymat) |
| `POSTGRES_PASSWORD` | ✅ | Docker PostgreSQL paroli |
| `TELEGRAM_*` | — | Bot tokeni va kanal ID'lari |
| `APP_PORT`, `COOKIE_SECURE` | — | Deploy sozlamalari |

---

## Buyruqlar

| Buyruq | Vazifasi |
| --- | --- |
| `npm run dev` | Dev server (port 3100) |
| `npm run build` | Production build |
| `npm run lint` | ESLint (talab: 0 xato) |
| `npm test` | Vitest (unit testlar) |
| `npm run test:e2e` | Playwright (E2E testlar) |
| `npm run db:migrate` | Migratsiya (dev) |
| `npm run db:deploy` | Migratsiyalarni qo'llash (prod) |
| `npm run db:seed` | Namuna ma'lumotlar |
| `npm run create-admin` | Birinchi admin foydalanuvchi |
| `npx prisma studio` | Bazani vizual ko'rish |

---

## Loyiha tuzilishi

```
src/
  app/(app)/      # autentifikatsiya ortidagi sahifalar (lidlar, mijozlar, tolovlar, ...)
  app/api/        # health, analytics, report/pdf, himoyalangan chek yo'li
  actions/        # Server Actions (leads, clients, payments, tickets, users, ...)
  components/     # UI komponentlar
  lib/            # constants, validation, auth, db, telegram, reports, utils
prisma/           # schema.prisma + migrations + seed
scripts/          # bot.ts (worker), create-admin.ts, deploy skriptlari
e2e/              # Playwright testlari
```

> **Status qiymatlari** (holatlar, natijalar, rollar) — `src/lib/constants.ts` da
> yagona manba sifatida boshqariladi. Yangi qiymat qo'shsangiz, Zod validatsiyasi
> va o'zbekcha yorliqlar avtomatik yangilanadi.

---

## Ishlab chiqish jarayoni

1. `main` dan yangi feature branch oching.
2. O'zgarish kiritib, PR yarating.
3. CI yashil bo'lishini kuting (`lint → tsc → Vitest → build` va E2E).
4. Ko'rikdan so'ng `main` ga merge qiling.

> `main` ga to'g'ridan-to'g'ri push qilinmaydi.

---

## Deploy

Production: **https://tpautomation.uz** (Caddy orqali avtomatik HTTPS).

Har `main` ga push'da Docker image GHCR'ga build va push qilinadi; server faqat
**pull** qiladi (`docker compose pull && up -d`), migratsiyalar `migrate` xizmati
orqali avtomatik qo'llanadi.

> ⚠️ Prod serverda `next build` ishlatilmaydi (xotira cheklovi) — faqat tayyor
> GHCR image'dan pull qilinadi.

---

## Xavfsizlik

- **Mijoz ma'lumotlari — PII.** `.env`, `uploads/` (cheklar), `backups/`, DB dump'lar
  va xom import fayllari git-ignore qilingan; hech qachon commit qilinmaydi.
- Productionda `SESSION_SECRET` albatta kuchli, tasodifiy qiymatga o'rnatiladi.
- Rollarga asoslangan kirish nazorati (RBAC) uch qatlamda: middleware, sahifa va
  Server Action darajasida.
