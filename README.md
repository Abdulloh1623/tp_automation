# TP Automation — POS CRM

Restoran/kafe uchun POS uskunalari (monoblok, printer, router) o'rnatadigan va POS
dasturini qo'llab-quvvatlaydigan kompaniyaning **ichki CRM tizimi**: mijozlar bazasi,
obuna/to'lovlar, kunlik qo'ng'iroq jarayoni, uskuna hisobi va Telegram hisobotlari.

**Jonli tizim:** https://tpautomation.uz (faqat xodimlar uchun, ochiq ro'yxatdan o'tish yo'q)

> **🤖 AI/agentlar uchun:** to'liq texnik kontekst — [AI_CONTEXT.md](AI_CONTEXT.md)
> (ingliz tilida: arxitektura, data model, ish oqimlari, konvensiyalar).
> UI tili — **o'zbekcha (lotin)**; kod identifikatorlari inglizcha/aralash.
> Deploy qo'llanmasi — [DEPLOY.md](DEPLOY.md).

---

## Tizim nima qiladi

- **Mijozlar bazasi** — 350+ restoran: shartnoma, telefon(lar), viloyat, oylik to'lov, uskunalar.
- **Kunlik qo'ng'iroq oqimi** — har kuni 08:00 da lidlar operatorlarga tasodifiy taqsimlanadi
  (qarzdorlar navbat boshida); operator natija tanlaydi, lid kun yakunida tegishli bo'limga o'tadi.
- **To'lov qabul qilish** — chek rasmi **majburiy**; har to'lov Telegram to'lovlar kanaliga tushadi.
- **Eskalatsiya / Muammolar / Qaytarish** — bir xil naqsh: **boshliq usta biriktiradi →
  TP xodimi usta bilan bog'lanib jarayonni yakunlaydi → boshliq statistikani ko'radi**.
  (Ustalar tizimga kirmaydi — telefon orqali boshqariladi.)
- **Otkaz** — xizmatdan voz kechgan mijozlar alohida bo'limda (qarzi bo'lsa baribir undiriladi).
- **Ombor** — uskuna kirimi, ustalarga taqsimlash, mijozga ijara/sotuv, inventarizatsiya.
- **Telegram** — kunlik/haftalik/oylik grafikli hisobotlar, eslatmalar, backup, xato ogohlantirishlari.
- **Import/Eksport** — Excel (.xlsx/.xls) va CSV import (ustun avto-moslash bilan), CSV/Excel eksport.
- **To'liq audit** — kim, qachon, nima qilgani (login'dan to har bir o'zgarishgacha).

## Texnologiyalar

| Qatlam | Tanlov |
|--------|--------|
| Framework | Next.js 15 (App Router, Server Actions), React 19, TypeScript |
| Baza | PostgreSQL + Prisma 6 (holatlar oddiy string — enum emas, manba: `src/lib/constants.ts`) |
| UI | Tailwind CSS, dark mode (`class`), to'liq o'zbekcha |
| Auth | Maxsus JWT (jose HS256) + bcryptjs; cookie `tp_session`; 3 qatlamli RBAC |
| Telegram | grammY bot + node-cron worker (`scripts/bot.ts` — alohida jarayon) |
| Hisobot rasmlari | SVG → PNG (`@resvg/resvg-js`), PDF (`pdf-lib`) |
| Test | Vitest (unit) + Playwright (E2E), CI: lint + tsc + test + build |
| Deploy | Docker Compose + **GHCR registry** (image CI'da quriladi, server faqat `pull`) |

## Arxitektura

```
                    ┌──────────── AWS EC2 (Docker Compose) ────────────┐
Internet ──HTTPS──► │ Caddy (80/443, avto Let's Encrypt)               │
                    │   └─► app  (Next.js, port 3100)  ──┐             │
                    │       worker (bot + cron)        ──┼─► PostgreSQL│
                    │       migrate (bir martalik)     ──┘             │
                    └──────────────────────────────────────────────────┘
GitHub main ► Actions (CI + image build) ► ghcr.io/abdulloh1623/tp_automation:latest
Serverda yangilash:  git pull && docker compose pull && docker compose up -d
```

## Rollar va bo'limlar

| Rol | Kirish | Asosiy vazifa |
|-----|--------|---------------|
| **ADMIN** | hammasi | foydalanuvchilar, import, audit, bildirishnoma, boshqaruv paneli |
| **MANAGER** (boshliq) | operatsion bo'limlar | usta biriktirish (eskalatsiya/qaytarish/muammo), ombor, hisobot, nazorat |
| **OPERATOR** (TP xodimi) | kunlik ish + kuzatuv | qo'ng'iroqlar, to'lov yozish, usta bilan bog'lanib jarayon yuritish |
| **INSTALLER** (usta) | **kirmaydi** | ma'lumot sifatida saqlanadi; boshliq/xodim telefon orqali boshqaradi |

Bo'limlar: `/lidlar` (kunlik ish) · `/mijozlar` · `/toldirilmagan` · `/tolovlar` ·
`/muammolar` · `/eskalatsiya` · `/qaytarish` · `/otkaz` · `/ombor` · `/ustalar` ·
`/analitika` (jonli) · `/hisobot` · `/foydalanuvchilar` · `/audit` · `/import` ·
`/bildirishnomalar` · `/profil`. Barcha ro'yxatlarda qidiruv + viloyat/holat filtrlari.

## Lid hayot sikli (qisqacha)

Operator dropdown'dan natija tanlaydi → `pendingStage` belgilanadi (lid joyida qoladi) →
**"Kunni yakunlash"** bosilganda lid tegishli bo'limga o'tadi:

- *Ko'tarmadi/o'chiq* → ertaga qayta (3 martadan keyin avtomatik **eskalatsiya**)
- *Muammo bor* → avtomatik **ticket** (`/muammolar`)
- *Uskuna qaytarish kerak* → avtomatik ariza (`/qaytarish`)
- *Otkaz* → `/otkaz` bo'limi
- *To'lov qildi* → chek modal (majburiy) → Telegram to'lovlar kanali
- To'lov muddati o'tganlar bo'limidan qat'i nazar **"Qarzdor"** belgisi bilan kunlik ro'yxatda

## Avtomatika (worker cron, Asia/Tashkent)

| Vaqt | Ish |
|------|-----|
| 08:00 | kunlik lid taqsimoti (random, qarzdorlar ustuvor) |
| 09:30 / 15:00 | operator/boshliqqa shaxsiy Telegram eslatmalari |
| 18:30 | kunlik grafikli hisobot → asosiy kanal |
| Dush 09:00 / oy 1-kuni 09:00 | haftalik / oylik hisobot |
| 03:00 | PostgreSQL backup (gzip) → backup kanali |
| 00:00 | kun almashinuvi tozalash |

## Lokal ishga tushirish

```bash
# 1. PostgreSQL (Docker, port 5433)
docker run -d --name tp-postgres -p 5433:5432 \
  -e POSTGRES_USER=tp -e POSTGRES_PASSWORD=PAROL -e POSTGRES_DB=tp_automation postgres:16

# 2. Muhit
cp .env.example .env       # DATABASE_URL=localhost:5433, SESSION_SECRET to'ldiring

# 3. O'rnatish va baza
npm install
npm run db:migrate          # migratsiyalar
npm run db:seed             # demo ma'lumotlar (FAQAT lokal — bazani tozalaydi!)

npm run dev                 # http://localhost:3100
```

Seed hisoblari (hammasiga parol `parol123`): `admin` (ADMIN), `boshliq` (MANAGER),
`abdulla`/`javohir`/`biloliddin`/`mehroj` (OPERATOR).

**Diqqat:** `npm run bot` ni lokalda ishlatmang — bot prodda ishlaydi, bitta token
bilan ikki joyda polling = Telegram 409 Conflict.

## Testlar va CI

```bash
npm run lint && npx tsc --noEmit   # sifat
npm test                           # Vitest unit testlar
npm run test:e2e                   # Playwright E2E
```

CI (GitHub Actions): har PR'da lint + tsc + test + build + E2E. `main`ga merge →
image avtomatik GHCR'ga quriladi. Hech qachon serverda `next build` qilinmaydi (2GB RAM).

## Repo tuzilishi

```
prisma/            sxema + qo'lda yozilgan migratsiyalar + seed
src/app/(app)/     himoyalangan sahifalar (har papka = bo'lim)
src/actions/       server action'lar (barcha mutatsiyalar shu yerda, rol guard bilan)
src/components/    UI komponentlar (jadval/karta/filtr/modal)
src/lib/           yadro: constants.ts (holatlar manbai), auth, rbac, telegram,
                   reports, charts/, leads-distribution, csv, validation (zod)
scripts/           bot.ts (worker), create-admin.ts, deploy-pull.sh
```

**Konvensiyalar:** yangi holat qo'shishda faqat `src/lib/constants.ts` o'zgaradi;
har mutatsiya audit yozadi (`logAudit`); PII (`_import/`, `uploads/`, `backups/`, `.env`)
repoga tushmaydi; UI matnlari o'zbekcha.
