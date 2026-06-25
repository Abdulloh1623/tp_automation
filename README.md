# POS CRM — TP Automation

Restoran/kafe/fastfud uchun POS dasturi va monoblok terminallarini sotadigan
kompaniya uchun mijozlar bazasi, obuna/to'lov va kunlik qo'ng'iroq jurnalini
boshqarish platformasi.

## Texnologiyalar

- Next.js 15 (App Router, TypeScript, Server Actions)
- Prisma + SQLite
- Tailwind CSS
- Auth: jose (JWT cookie) + bcryptjs

## Ishga tushirish

```bash
npm install
npx prisma migrate dev      # bazani yaratish
npx prisma db seed          # namuna ma'lumotlar
npm run dev                 # http://localhost:3100
```

Kirish ma'lumotlari (seed):

| Login    | Parol        | Rol      |
| -------- | ------------ | -------- |
| admin    | admin123     | Admin    |
| asadbek  | operator123  | Operator |
| suxrob   | operator123  | Operator |

## Modullar (MVP)

- **Boshqaruv paneli** — metrikalar + "bugungi ish ro'yxati" (to'lov kuni
  yetgan, rejalashtirilgan qo'ng'iroq yoki ochiq muammosi bor mijozlar)
- **Mijozlar** — ro'yxat (qidiruv/filtr), yangi mijoz, mijoz kartochkasi
- **To'lovlar** — obuna holati, muddati o'tgan/yaqin to'lovlar, yig'im
- **Qo'ng'iroq jurnali** — har mijoz bo'yicha kunlik qo'ng'iroq natijalari
- **To'lov qabul qilish** — keyingi to'lov sanasini avtomatik suradi

## Foydali buyruqlar

```bash
npm run build       # production build
npm run db:reset    # bazani tozalab qayta seed qilish
npx prisma studio   # bazani vizual ko'rish
```

## Keyingi bosqichlar

- 2-bosqich: Ticket/muammolar UI, hisobot dashboard, Google Sheet CSV import
- 3-bosqich: Telegram/SMS (Eskiz.uz) avtomatik to'lov eslatmasi,
  Yandex/Uzum integratsiya, PostgreSQL + deploy

## Eslatma

- Baza: SQLite (`prisma/dev.db`). PostgreSQL'ga o'tish uchun
  `prisma/schema.prisma` da `provider`ni o'zgartiring va status maydonlarini
  enum'ga aylantirsa bo'ladi (hozir String, `src/lib/constants.ts` da boshqariladi).
- `.env` da `SESSION_SECRET` ni productionda albatta o'zgartiring.
