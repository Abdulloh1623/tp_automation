# POS CRM — TP Automation

Restoran / kafe / fastfud uchun **POS dasturi va monoblok terminallarini** sotadigan
va o'rnatadigan kompaniyaning ichki CRM tizimi: mijozlar bazasi, obuna/to'lov
boshqaruvi, kunlik qo'ng'iroq jarayoni, muammolar (ticket) va ombor.

> Butun interfeys **o'zbek tilida (lotin)**. Tizim faqat ichki foydalanish uchun —
> ochiq/mijozga ko'rinadigan sahifa yo'q, hamma narsa autentifikatsiya ortida.
> Kengroq texnik ma'lumot uchun: [`AI_CONTEXT.md`](AI_CONTEXT.md).

## Texnologiyalar

- **Next.js 15** (App Router, React 19, Server Actions) + **TypeScript**
- **Prisma 6** → **PostgreSQL** (status maydonlari String, `src/lib/constants.ts` da boshqariladi)
- **Tailwind CSS** (dark mode: class)
- Auth: **jose** (JWT cookie, HS256) + **bcryptjs**
- Telegram: **grammY** bot + **node-cron** (eslatma, backup, to'lov/xato kanallari)
- Hisobot: **pdf-lib** + **@resvg/resvg-js** (SVG grafik → PNG)
- Validatsiya: **zod** · Testlar: **Vitest** + **Playwright**
- Deploy: **Docker Compose** + AWS EC2, image **GHCR**da

## Ishga tushirish (lokal)

PostgreSQL Docker'da 5433-portda ishlaydi (`.env` → `DATABASE_URL`).

```bash
npm ci
npx prisma generate
npm run db:migrate        # bazani yaratish/migratsiya
npm run db:seed           # namuna foydalanuvchilar (dev parollar: parol123)
npm run dev               # http://localhost:3100
npm run bot               # (ixtiyoriy) Telegram worker + cron — ALOHIDA jarayon
```

- Dev server porti: **3100**. Lokal baza: `postgresql://tp:***@localhost:5433/tp_automation`.
- Seed foydalanuvchilari: `admin` (ADMIN) va operatorlar; dev'da barcha parol `parol123`.
- Kerakli `.env`: `DATABASE_URL`, `SESSION_SECRET`, `POSTGRES_PASSWORD`.
  Ixtiyoriy: `TELEGRAM_*`, `COOKIE_SECURE`, `APP_PORT`, `TP_IMAGE`.

> ⚠️ **Prodda `npm run bot` ni lokalda ishlatmang** — bot va kanallar production'da jonli.

## Modullar

- **Boshqaruv paneli** (`/`, admin) — metrikalar, operator faolligi, daromad xulosasi
- **Kunlik ish** (`/lidlar`) — operatorning kunlik lid ro'yxati: qo'ng'iroq natijasi +
  izoh yoziladi, lid avtomatik to'g'ri navbatga o'tadi. **Mijoz nomiga bosilsa —
  to'liq ma'lumot modali** (telefonlar, shartnoma, uskunalar, to'lov holati)
- **Mijozlar** (`/mijozlar`) — ro'yxat (qidiruv/filtr), kartochka, tahrirlash
- **To'ldirilmagan** (`/toldirilmagan`) — restoran/telefon/viloyati yetishmaydiganlar
- **To'lovlar** (`/tolovlar`) — obuna holati, muddati o'tgan/yaqin to'lovlar
- **Muammolar** (`/muammolar`) — ticketlar; kartada **mijozning oxirgi izohi ko'rinadi**;
  boshliq integratorni (ustani) biriktiradi
- **Eskalatsiya / Qaytarish / Otkaz** — boshliq navbatlari (usta biriktirish, uskuna
  qaytarish, voz kechgan mijozlar)
- **Ombor** (`/ombor`) — inventar, uskuna turlari, harakatlar
- **Ustalar** (`/ustalar`) — dala texniklari (login'siz kontaktlar)
- **Analitika / Tablo** (`/analitika`, `/tablo`) — jonli ko'rsatkichlar (5s polling)
- **Foydalanuvchilar / Audit / Import / Bildirishnomalar / Hisobot / Profil**
  — **Profil'da xodim "Mening natijalarim" (bugun/hafta/oy) statistikasini ko'radi**

### To'lov qabul qilish

To'lov formasida summa, valyuta, oy soni, **to'lov usuli (Karta orqali / QR kod
orqali)** tanlanadi va **chek rasmi majburiy** (yuklash yoki Ctrl+V paste). To'lov
qabul qilingach keyingi to'lov sanasi avtomatik suriladi va ma'lumot Telegram
to'lovlar kanaliga (chek rasmi bilan) yuboriladi.

## Foydali buyruqlar

```bash
npm run build            # production build
npm run lint             # ESLint (gate: 0 xato)
npm test                 # Vitest (unit)
npm run test:e2e         # Playwright (E2E)
npm run db:deploy        # migratsiyalarni qo'llash (prod)
npm run db:reset         # bazani tozalab qayta seed (DIQQAT: hamma data o'chadi)
npm run create-admin     # birinchi admin yaratish
npx prisma studio        # bazani vizual ko'rish
```

## Ish jarayoni (contribution)

Feature branch → PR → CI yashil → `main` ga merge. **`main`ga to'g'ridan-to'g'ri
push qilinmaydi.** PR'lar GitHub REST API orqali yaratiladi (`gh` CLI o'rnatilmagan).
CI (Node 22): `lint → tsc → Vitest → build` va alohida **E2E (Playwright)** job.

## Deploy (production)

**https://tpautomation.uz** — jonli (Caddy HTTPS). Har `main`ga push'da Docker image
GHCR'ga build/push bo'ladi; server faqat **pull** qiladi (`docker compose pull && up -d`),
migratsiyalar `migrate` xizmati orqali avtomatik qo'llanadi. Batafsil: [`DEPLOY.md`](DEPLOY.md).

> **Prod serverda `next build` ISHLATMANG** (2 GB RAM → OOM). Faqat GHCR image'dan pull.

## Eslatmalar

- Baza — **PostgreSQL** (Docker `tp-postgres`, port 5433). Status maydonlari String
  ko'rinishida (`src/lib/constants.ts` yagona manba); yangi qiymatni shu yerga qo'shsangiz,
  Zod enum va yorliqlar avtomatik yangilanadi.
- **Mijoz ma'lumotlari PII** — `_import/`, `uploads/`, `backups/`, `.env`, DB dump'lar
  git-ignore qilingan. Hech qachon commit qilmang.
- Productionda `SESSION_SECRET` ni albatta kuchli qiymatga o'rnating.
