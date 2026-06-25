# TP Automation CRM — Foydalanuvchi qo'llanmasi

> Restoran POS uskunalari (dastur + monoblok + printer + WiFi router) obuna biznesi
> uchun mijozlar, to'lovlar, ombor va dala ishlarini boshqarish tizimi.

Ushbu qo'llanma **barcha rollar** uchun mo'ljallangan. O'z rolingiz bo'limiga o'ting:
[Texnik xodim (Operator)](#3-texnik-xodim-operator), [Usta](#4-usta),
[Texnik bo'lim boshlig'i (Manager)](#5-texnik-bolim-boshligi-manager),
[Administrator](#6-administrator).

---

## Mundarija
1. [Tizimga kirish](#1-tizimga-kirish)
2. [Umumiy elementlar](#2-umumiy-elementlar)
3. [Texnik xodim (Operator)](#3-texnik-xodim-operator)
4. [Usta](#4-usta)
5. [Texnik bo'lim boshlig'i (Manager)](#5-texnik-bolim-boshligi-manager)
6. [Administrator](#6-administrator)
7. [Telegram bot va kanallar](#7-telegram-bot-va-kanallar)
8. [Tizimni ishga tushirish va zaxira (backup)](#8-tizimni-ishga-tushirish-va-zaxira)
9. [Tez-tez beriladigan savollar (FAQ)](#9-faq-va-muammolar)

---

## 1. Tizimga kirish

1. Brauzerda manzilni oching: **http://localhost:3100**
2. **Login** va **parol**ni kiriting, "Kirish" tugmasini bosing.
3. Har bir rol o'zining asosiy sahifasiga yo'naltiriladi.

### Rollar va imkoniyatlar

| Rol | Login (namuna) | Asosiy sahifa | Asosiy vazifasi |
|-----|----------------|---------------|------------------|
| **Administrator** | `admin` | Boshqaruv paneli | Butun tizim, foydalanuvchilar, audit, import |
| **Texnik bo'lim boshlig'i** (Manager) | `boshliq` | Ombor | Ombor, ustalar, eskalatsiya, hisobot |
| **Texnik xodim** (Operator) | `asadbek` | Kunlik ish | Mijozlarga qo'ng'iroq, to'lov, lidlar |
| **Usta** (dala texnigi) | `bekzod` | Vazifalar | O'rnatish/yig'ish vazifalari (telefonda) |

> ⚠️ Parollar maxfiy. Birinchi kirgandan so'ng adminlardan parolingizni
> o'zgartirishni so'rang. Faolsizlantirilgan xodim tizimga kira olmaydi.

### Chiqish
Chap menyu pastidagi (telefonda — yuqori o'ngdagi) **"Chiqish"** tugmasi.

---

## 2. Umumiy elementlar

- **Chap menyu (navbar):** sizning rolingizga ruxsat etilgan bo'limlar ko'rinadi.
- **Qidiruv:** ko'p jadvallarda yuqorida qidiruv maydoni bor (restoran nomi, FIO,
  telefon, viloyat bo'yicha).
- **Telefon raqamlari** ko'k rangda — bosilsa qo'ng'iroq qilinadi (telefonda).
- Har bir muhim amal **audit jurnaliga** yoziladi (kim, nima, qachon).

---

## 3. Texnik xodim (Operator)

Asosiy ish joyingiz — **"Kunlik ish"** (lidlar) sahifasi. Bu yerda har kuni sizga
biriktirilgan mijozlarga qo'ng'iroq qilib, natijani belgilaysiz.

### 3.1. Kunlik ish jadvali
Jadval Google Sheets uslubida: har bir qator — bitta mijoz.

- **Joriy** / **Tarix** tugmalari: "Joriy" — bugun bajariladigan ishlar; "Tarix" —
  o'tgan kunlardagi natijalar (kun ustunlari bo'yicha).
- Ustunlar: Restoran / FIO, Viloyat, Telefon, **K.** (ketma-ket ko'tarilmaganlar
  soni), Bo'lim, Oxirgi aloqa, To'lov, **Bugun** (natija), **Izoh**, Amallar.
- **Qarzdor (N kun)** — qizil belgi: to'lov muddati o'tgan mijoz. Bunday qatorlar
  sariq fon bilan ajralib turadi — ularga e'tibor bering.

### 3.2. Qo'ng'iroq natijasini belgilash
1. Mijoz bilan gaplashing.
2. **"Bugun"** ustunidagi ro'yxatdan (dropdown) natijani tanlang:
   - **Gaplashildi**, **Ko'tarmadi**, **Telefon o'chiq**, **Band**,
   - **Keyinroq tel qilish**, **To'lov qiladi**, **Ertaga to'lov qiladi**,
   - **Oylik to'lov eslatildi**, **Muammo bor**, **Muammo yo'q**,
   - **To'lov qildi**, **O'chirib qo'ydi** va h.k.
3. **Izoh** ustuniga qisqacha izoh yozing (avtomatik saqlanadi — "saqlandi" belgisi).

> Tizim natijaga qarab mijozni keyingi bo'limga o'tkazadi va keyingi aloqa kunini
> **o'zi belgilaydi** (siz sana tanlamaysiz).

### 3.3. "To'lov qildi" — chek bilan
"To'lov qildi" tanlansa **chek oynasi** ochiladi:
1. Summani tekshiring (mijozning oylik to'lovi avtomatik qo'yiladi), valyuta, sana.
2. **Chek rasmini** yuklang **yoki** nusxalab (Ctrl+V) "Clipboarddan" qo'ying. Chek
   **majburiy**.
3. **"Tasdiqlash va yuborish"** — to'lov yoziladi, mijoz ma'lumoti + chek avtomatik
   **to'lovlar kanaliga** yuboriladi.

### 3.4. Ketma-ket ko'tarilmasa
Agar mijoz **3 martadan ortiq** ketma-ket ko'tarmasa, lid avtomatik **boshliq
navbatiga (eskalatsiya)** o'tadi.

### 3.5. Boshqa amallar
- **Maxsus izoh** ("Maxsus" tugmasi): mijoz nomi yonida 🔔 qo'ng'iroqcha paydo
  bo'ladi. Doimiy muhim eslatma uchun (masalan: "faqat kechqurun qo'ng'iroq qiling").
- **Boshliqqa** ("Boshliqqa" tugmasi): muammoli mijozni qo'lda boshliq navbatiga
  yuborish.
- **Excel**: jadvalni Excel/CSV ga yuklab olish.
- **Kunni yakunlash**: kun oxirida bosing — bugungi natijalarga ko'ra lidlar yangi
  bo'limlarga ko'chadi.

### 3.6. Mijozlar bo'limi
- **Mijozlar** menyusi: barcha mijozlar ro'yxati, qidiruv.
- **Yangi mijoz**: forma to'ldiriladi. **Asosiy telefon** majburiy; pastda
  **"Telefon qo'shish"** bilan yorliqli qo'shimcha raqamlar (Egasi, Menejer, Kassir,
  Buxgalter...) kiritiladi.
- Mijoz kartochkasida: ma'lumotlar, **barcha telefonlar**, qo'ng'iroq jurnali,
  muammolar, obuna/to'lov, uskunalar.
- **To'lov qabul qilish** (kartochkada): summa + valyuta + chek (majburiy) →
  "To'lovni qabul qilish". Chek to'lovlar kanaliga ham ketadi.

### 3.7. Muammolar (ticket)
- Mijoz kartochkasida yoki **Muammolar** menyusida muammo (ariza) ochiladi:
  sarlavha, turi (Texnik/Funksiya/To'lov/Soliq), muhimligi.
- Holatlar: **Ochiq → Jarayonda → Hal qilindi**.

---

## 4. Usta

Usta uchun sahifa **telefon uchun** moslashtirilgan. Bitta menyu — **"Vazifalar"**.

### 4.1. Telegramga ulanish (bir marta)
Botdan foydalanish shart emas, lekin tizimga kirib vazifalarni ko'rasiz. Login va
parolni admin/boshliq beradi.

### 4.2. Vazifalar
Vazifalar ikki turda bo'ladi:

**A) O'rnatish / xizmat vazifasi** — sizga biriktirilgan mijoz:
1. Mijoz nomi, manzili, telefoni (bosib qo'ng'iroq qiling), izohni ko'ring.
2. Holatni yangilang: **Yo'ldaman → Bordim → Bajarildi** (yoki *Hal bo'lmadi*,
   *Qayta kerak*). Kerak bo'lsa izoh yozing.

**B) Uskuna olib kelish (qaytarish)** — sariq belgili karta:
1. Mijoz biz bilan ishlashni to'xtatgan — uskunalarni olib kelishingiz kerak.
2. "Olib kelinadigan uskunalar" ro'yxatini ko'ring.
3. Uskunalarni olib kelgach **"Olib keldim (tasdiqlash)"** tugmasini bosing —
   uskunalar avtomatik sizning hisobingizga (zaxirangizga) o'tadi.

---

## 5. Texnik bo'lim boshlig'i (Manager)

Manager ombor, ustalar va texnik jarayonlarni boshqaradi. Menyu: Kunlik ish,
Vazifalar, **Ombor**, **Ustalar**, Mijozlar, To'lovlar, Muammolar, Eskalatsiya,
Hisobot.

### 5.1. Ombor
Yuqorida ko'rsatkichlar: omborda dona, ombor qiymati, mijozlarda, ijara daromadi,
ustalarda, kutilayotgan qaytarishlar.

- **Ombor qoldig'i va narxlar:** har bir texnika turi (Printer, Monoblok, WiFi
  router) uchun **ijara narxi (oylik)** va **sotuv narxi** kiritiladi (maydonni
  tahrirlab, boshqa joyga bosing — saqlanadi).
- **Omborga kirim:** texnika + miqdor → "Kirim".
- **Ustaga taqsimot:** texnika + usta + miqdor + **izoh (majburiy)** → "Berish".
- **Brakka chiqarish:** manba (Ombor yoki Usta) + texnika + miqdor + **izoh
  (majburiy)** → "Brakka chiqarish".
- **Usta zaxiralari:** har bir ustada qancha texnika borligi.

### 5.2. Uskuna qaytarish arizalari
Ombor sahifasining yuqorisida **"Qaytarish arizalari"** paneli:
1. Operator yuborgan ariza ko'rinadi (mijoz, viloyat, izoh) + mos usta avtomatik
   ko'rsatiladi (mijoz viloyatiga ko'ra).
2. **"Tasdiqlash"** — uskunani olib kelish vazifasi avtomatik o'sha ustaga
   biriktiriladi. **"Rad etish"** — ariza bekor qilinadi.

### 5.3. Mijozga uskuna biriktirish
Mijoz kartochkasida **"Uskunalar"** bo'limi (faqat manager/admin ko'radi):
- Texnika + egalik (**Ijara** yoki **Sotuv**) + miqdor → "Biriktirish".
- **Ijara** → oylik to'lovga qo'shiladi (kartochkada "Jami oylik" = asos + ijara
  alohida ko'rsatiladi).
- **Sotuv** → bir martalik to'lov yoziladi.

### 5.4. Ustalar boshqaruvi
**Ustalar** menyusi:
- **Yangi usta**: ism, login, parol, **viloyat**, telefon.
- Tahrirlash, parol almashtirish, faollashtirish/faolsizlantirish.
- O'chirish: bog'liqlik (mijoz/zaxira) bo'lsa o'chirib bo'lmaydi — faqat
  faolsizlantiriladi.

> Viloyat muhim: qaytarish arizasi tasdiqlanganda uskuna **mijoz viloyatidagi
> ustaga** avtomatik biriktiriladi.

### 5.5. Eskalatsiya
**Eskalatsiya** menyusi: boshliq navbatiga tushgan lidlar (3+ ko'tarilmagan yoki
qo'lda yuborilgan). Har birini ko'rib, kerak bo'lsa **ustaga biriktiring**.

### 5.6. Hisobot va PDF
**Hisobot** menyusi: umumiy ko'rsatkichlar (jami/faol mijoz, MRR, yig'im, qarzdor,
ochiq muammolar), viloyat va operatorlar tahlili, grafiklar.
- **PDF hisobot** tugmasi: ko'p sahifali PDF yuklab oladi — KPI, **bugungi natijalar
  (qo'ng'iroq holatlari soni)**, grafiklar va **muammoli mijozlar (izohlari bilan)**.
- **Telegramga**: Kunlik / Haftalik / Oylik grafik hisobotni darhol kanalga yuborish.

### 5.7. To'lovlar
**To'lovlar** menyusi: qarzdorlar, yaqinlashayotgan to'lovlar, yig'im ko'rsatkichlari.

---

## 6. Administrator

Admin barcha bo'limlarga kira oladi. Qo'shimcha: **Foydalanuvchilar**, **Audit**,
**Import**, **Boshqaruv paneli**, **Backup**.

### 6.1. Boshqaruv paneli
Bosh sahifa: bugungi asosiy ko'rsatkichlar, yaqin to'lovlar, oxirgi faollik.

### 6.2. Foydalanuvchilar
**Foydalanuvchilar** menyusi:
- **Yangi foydalanuvchi**: ism, login, parol, **rol** (Admin/Manager/Operator/Usta),
  viloyat, telefon, Telegram ID.
- Tahrirlash, parol tiklash, faollashtirish/faolsizlantirish.
- **Telegram ID** — xodim botga `/start` yozganda chiqadigan ID; shu yerga kiritsangiz
  u botdan foydalana oladi (faqat Admin/Manager).

### 6.3. Import (CSV/Excel)
**Import** menyusi (faqat Admin):
1. CSV faylni tanlang.
2. Ustunlarni moslang (tizim avtomatik taklif qiladi).
3. Rejim: **Yangi qo'shish** yoki **Yangilash** (telefon bo'yicha aniqlanadi).
4. Import natijasi ko'rsatiladi (qo'shilgan/yangilangan/o'tkazilgan + xatolar).

### 6.4. Audit jurnali
**Audit** menyusi: barcha amallar (kim, nima, qachon) — login/chiqish, mijoz,
to'lov, uskuna, qo'ng'iroq va h.k.
- **"Hozir backup"** tugmasi: darhol zaxira nusxa yaratadi (lokal + Telegram).

---

## 7. Telegram bot va kanallar

Bot: **@biznexautobot** (Biznex Automation Robot).

### 7.1. Botga ulanish
1. Botga **`/start`** yozing.
2. Bot sizning **Telegram ID**ngizni ko'rsatadi.
3. Admin shu ID'ni sizning profilingizga kiritadi (faqat Admin/Manager
   botdan foydalana oladi).
4. Qayta `/start` — menyu ochiladi.

### 7.2. Bot menyusi (Admin/Manager)
- **➕ Xodim qo'shish** — bosqichma-bosqich (rol → ism → login → parol → viloyat).
- **🔑 Parol o'zgartirish** — xodimni tanlab, yangi parol.
- **📊 Kunlik lid soni** — xodimning kunlik lid normasini o'zgartirish.
- **📅 1 kunlik qo'shimcha lid** — bir kunga qo'shimcha lid berish.
- **📈 Hisobot yuborish** — kunlik/haftalik/oylik grafik hisobotni kanalga.

### 7.3. Kanallar
- **Hisobot kanali** — avtomatik kunlik (18:30), haftalik (Dushanba 09:00),
  oylik (1-kun 09:00) grafik hisobotlar.
- **To'lovlar kanali** — har bir to'lovda mijoz ma'lumoti + summa + sana + chek rasmi.
- **Zaxira (backup) kanali** — har kuni 03:00 da baza nusxasi.

> Bu avtomatik funksiyalar ishlashi uchun **worker** (`npm run bot`) doimo ishlab
> turishi kerak (start.bat buni o'zi ishga tushiradi).

---

## 8. Tizimni ishga tushirish va zaxira

### 8.1. Ishga tushirish
- **`start.bat`** faylini ikki marta bosing. U avtomatik: kutubxonalar, baza,
  loyihani tayyorlaydi va **Server (3100)** hamda **Telegram bot** oynalarini ochadi,
  brauzerni ochadi.
- **To'xtatish:** ochilgan ikki oynani (Server + Bot) yopish.
- **`build.bat`** — kodga o'zgartirish kiritilganda qayta qurish.

### 8.2. Zaxira (backup)
- Har kuni avtomatik **03:00** da (worker ishlab tursa).
- Qo'lda: **Audit** sahifasidagi **"Hozir backup"** tugmasi (admin).
- Nusxalar `backups/` papkasida (oxirgi 14 kun) + Telegram zaxira kanalida.

---

## 9. FAQ va muammolar

**Tizimga kira olmayapman.**
Login/parolni tekshiring. "Login yoki parol noto'g'ri" chiqsa — parol xato yoki
hisobingiz faolsizlantirilgan (adminga murojaat). 5 marta noto'g'ri urinishdan
keyin 15 daqiqaga bloklanasiz.

**"start.bat — Node.js topilmadi" deydi.**
Node.js o'rnatilganini tekshiring. Yangi o'rnatgan bo'lsangiz — kompyuterni qayta
yuklang. (Yoki https://nodejs.org dan o'rnating.)

**Telegram hisobot/chek/backup kelmayapti.**
`npm run bot` oynasi (start.bat ochadigan "TP Telegram Bot") ishlab turganini
tekshiring. Bot kanalga **admin** qilib qo'shilgan bo'lishi kerak.

**Chek qo'sha olmayapman ("Clipboarddan" ishlamadi).**
Rasm ustiga bosib nusxalang yoki **"Fayl yuklash"** orqali tanlang. Chek majburiy.

**Mijozning bir nechta telefoni bor.**
Mijozni tahrirlashda **"Telefon qo'shish"** bilan yorliqli (Egasi/Menejer/Kassir)
raqamlar qo'shing. Asosiy telefon qo'ng'iroq va qidiruv uchun ishlatiladi.

**Qarzdor mijozlar qayerda?**
Operator "Kunlik ish" jadvalida **"Qarzdor (N kun)"** belgisi bilan avtomatik
ko'rinadi. To'liq ro'yxat — PDF hisobotning "Muammoli mijozlar" bo'limida.

---

*TP Automation CRM · Foydalanuvchi qo'llanmasi · oxirgi yangilanish: 2026-06.*
