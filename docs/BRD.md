# Biznes Talablari Hujjati (BRD)
## Rol asosidagi portallar va ruxsatlar — TP Automation POS CRM

| | |
|---|---|
| **Versiya** | 0.4 (Ombor: brak, narx, qaytarish jarayoni, usta boshqaruvi) |
| **Sana** | 2026-06-22 |
| **Holat** | Ombor 6b — tasdiqlash kutilmoqda |
| **Tegishli** | TP Automation — POS CRM |

---

## 1. Hujjat maqsadi

Ushbu hujjat tizimga **to'rt xil foydalanuvchi roli** — **Administrator**,
**Texnik bo'lim boshlig'i**, **Texnik bo'lim xodimi** va **Usta** — uchun alohida,
har biri o'z ruxsatlariga ega web-portallar, hamda **Ombor (inventar) moduli**
qo'shish bo'yicha biznes talablarini belgilaydi.

Maqsad: **coding boshlanishidan oldin** qamrov (scope), rollar, ruxsatlar va ish
jarayonlarini kelishib olish.

## 2. Biznes konteksti

TP Automation restoran/kafe/fastfudlarga POS dasturi va monoblok/printer
uskunalarini sotadi, oylik obuna asosida xizmat ko'rsatadi. Hozirgi tizimda
mavjud: mijozlar bazasi, kunlik qo'ng'iroq (lid) jarayoni, to'lovlar, texnik
muammolar (ticket), hisobot va CSV import.

Jamoa uch toifaga bo'linadi:
- **Boshqaruv** — umumiy nazorat, hisobot, qarorlar.
- **Texnik bo'lim xodimi** — mijoz bilan aloqa, dasturiy muammolarni masofadan
  hal qilish, to'lov eslatmasi.
- **Usta** — joyiga borib o'rnatish/ta'mirlash, masofadan hal bo'lmagan ishlar.

**Muammo:** hozir barcha xodimlar deyarli bir xil interfeysni ko'radi.
**Talab:** har bir rol faqat o'ziga kerakli sahifa va amallarni ko'rsin
(xavfsizlik + soddalik + javobgarlik).

## 3. Rollar ta'rifi

### 3.1. Administrator
Tizimning to'liq egasi. Barcha ma'lumot va modullarga kirish, foydalanuvchilarni
boshqarish, biriktirishlar, hisobotlar.

### 3.2. Texnik bo'lim xodimi (ofis xodimi / operator)
Mijozlar bilan kunlik aloqada bo'ladi: qo'ng'iroq qiladi, holat yozadi, to'lovni
eslatadi/qabul qiladi, dasturiy muammolarni masofadan hal qiladi yoki ticket
ochadi. Masofadan hal bo'lmaydigan yoki joyiga borish kerak bo'lgan ishlarni
**ustaga yo'naltiradi**. (Hozirgi `OPERATOR` roli shu vazifani bajaradi.)

### 3.3. Usta (o'rnatuvchi / dala texnigi)
Joyiga borib bajariladigan ishlarni qiladi: yangi o'rnatish, ta'mirlash,
eskalatsiya qilingan (3+ ko'tarilmagan yoki texnik) mijozlar. Faqat **o'ziga
biriktirilgan vazifalarni** ko'radi, holatini yangilaydi va izoh yozadi.
Viloyat bo'yicha biriktirilgan; o'zida texnika zaxirasi bo'ladi.
(Hozirgi `INSTALLER` roli shu vazifani bajaradi.)

### 3.4. Texnik bo'lim boshlig'i (MANAGER) — yangi rol
**Omborni yuritadi** (texnika kirimi, ustalarga taqsimlash, qoldiq). Shuningdek
**eskalatsiya navbati**ni boshqaradi (ustaga biriktirish), mijozlar/muammolar va
hisobotni ko'radi. (Eskalatsiyadagi "boshliq" = shu rol; Telegram botda ham
admin bilan birga amal qiladi.) Foydalanuvchilar boshqaruvi, import va audit —
faqat ADMIN. Yangi `MANAGER` roli.

## 4. Har bir rol uchun portal / sahifalar

### 4.1. Administrator portali
- **Boshqaruv paneli** — umumiy KPI (faol mijozlar, MRR, qarzdorlar, ochiq
  muammolar, bugungi ishlar)
- **Kunlik lidlar** — barcha texnik xodimlar boardini ko'rish (operator tanlash)
- **Mijozlar bazasi** — to'liq CRUD, qidiruv/filtr
- **To'lovlar** — barcha to'lovlar, qarzdorlar, yig'im
- **Muammolar (ticketlar)** — barchasini ko'rish, biriktirish, yopish
- **Eskalatsiya navbati** *(yangi)* — 3+ ko'tarilmagan/yo'naltirilgan lidlar;
  admin ko'rib chiqib ustaga biriktiradi (tizim taklif qiladi)
- **Usta vazifalari** — barcha ustalar yuklamasi
- **Hisobot** — viloyat/operator/usta/churn/daromad
- **CSV import** — mijozlar bazasini yuklash
- **Foydalanuvchilar** *(yangi)* — xodim/usta qo'shish, rol berish, faollashtirish
- **Sozlamalar** *(yangi, ixtiyoriy)* — eskalatsiya chegarasi, valyuta va h.k.

### 4.2. Texnik bo'lim xodimi portali
- **Kunlik ish (lidlar)** — faqat o'ziga biriktirilgan mijozlar, bo'limlar bo'yicha
- **Mijoz kartochkasi** — o'ziga tegishli mijoz ma'lumoti, qo'ng'iroq tarixi,
  to'lov qabul qilish
- **Muammolar** — texnik muammo (ticket) ochish va o'ziniki(lar)ni kuzatish;
  kerak bo'lsa ustaga biriktirish
- **To'lov qabul qilish** — o'z mijozlari bo'yicha
- (Ko'rmaydi: boshqa xodim ma'lumoti, to'liq hisobot, import, foydalanuvchilar)

### 4.3. Usta portali
- **Mening vazifalarim** *(yangi)* — o'ziga biriktirilgan ishlar ro'yxati:
  eskalatsiya qilingan lidlar + texnik ticketlar + yangi o'rnatishlar
- Har bir vazifada: mijoz nomi, manzil/viloyat, telefon (`tel:`), muammo tavsifi
- **Holat yangilash** — "Yo'ldaman / Bordim / Bajarildi / Hal bo'lmadi" + izoh
- (Ko'rmaydi: to'lovlar, hisobot, boshqa mijozlar, import)

### 4.4. Texnik xodim — jadval (Google Sheets uslubi) ko'rinishi

Texnik xodimning kunlik ish sahifasi (`/lidlar`) **jadval** (qator/ustun)
ko'rinishida bo'ladi — operatorlar Google Sheets'da ishlashga o'rgangan.

**Ikki rejim:**
- **Joriy ko'rinish (asosiy):** Restoran/FIO · Viloyat · Telefon · K.
  (ko'tarilmagan) · Bo'lim · Oxirgi aloqa · To'lov (oylik + keyingi to'lov) ·
  **Bugun (natija)** · Izoh · **Amallar**.
- **Tarix ko'rinishi ("Tarixni ko'rish"):** chap tomonda qotirilgan mijoz
  ustunlari + kun-ustunlari. UIda **3 kun** ko'rinadi, gorizontal scroll bilan
  barcha oldingi kunlar. "Bugun" ustuni o'ngda qotirilgan va tahrirlanadi.

**Xulq-atvori:**
- Katak ichida tahrir (natija dropdown + izoh), **avto-saqlash** ("✓ saqlandi").
- **Qator/katak ranglari** (conditional formatting): qizil = ko'tarmadi/
  eskalatsiya, sariq = keyinroq/band, yashil = hal/to'lov.
- Qotirilgan sarlavha + "Restoran" va "Bugun" ustunlari; **klaviatura**
  (Tab/Enter bilan katakdan katakka); qidiruv/filtr/saralash; **Excelga eksport**.

**Izoh va xodim atributsiyasi (yangi):**
- Tarixda **kun katagiga bosilganda** o'sha kungi natija + **izoh** + **qaysi
  xodim** qoldirgani ko'rinadi. Izoh qoldirilmagan bo'lsa **"Izoh mavjud emas"**
  (xodim baribir ko'rsatiladi).
- Har bir holat/izohda uni kim yozgani/o'zgartirgani saqlanadi va ko'rsatiladi.

**Amallar ustuni (yangi):**
- **Boshliqqa yo'naltirish** — qo'lda eskalatsiya; lid admin/texnik bo'lim
  boshlig'i navbatiga tushadi (avtomatik 3+ eskalatsiya bilan bir xil oqim).
- **Maxsus izoh** — muhim/doimiy izoh qoldirish. Qoldirilganda mijoz nomi
  yonida **qo'ng'iroqcha (🔔)** belgisi chiqadi; **bosilganda** maxsus izoh
  matni + kim/qachon ko'rinadi; tahrirlash/o'chirish mumkin.

## 5. Ruxsatlar matritsasi

> ✓ = to'liq · ◐ = cheklangan (faqat o'ziga tegishli) · — = ruxsat yo'q

| Modul / Amal | Administrator | Texnik xodim | Usta |
|---|:---:|:---:|:---:|
| Boshqaruv paneli (umumiy KPI) | ✓ | — | — |
| Kunlik lidlar (qo'ng'iroqlar) | ✓ (hammasi) | ◐ (o'ziniki) | — |
| Mening vazifalarim (usta) | ✓ | — | ◐ (o'ziniki) |
| Mijozlar bazasi — ko'rish | ✓ | ◐ | ◐ (faqat vazifadagi) |
| Mijoz qo'shish / tahrirlash | ✓ | ◐ | — |
| Muammolar (ticket) — ko'rish | ✓ (hammasi) | ◐ (o'ziniki) | ◐ (biriktirilgani) |
| Ticket ochish | ✓ | ✓ | — |
| Ticketni ustaga biriktirish | ✓ | ✓ | — |
| Ticketni hal qilish/yopish | ✓ | ◐ | ◐ (o'ziniki) |
| To'lov qabul qilish | ✓ | ◐ (o'z mijozi) | — |
| To'lovlar ro'yxati / qarzdorlar | ✓ | ◐ yoki — | — |
| Hisobot / analitika | ✓ | — yoki ◐ | — |
| CSV import | ✓ | — | — |
| Foydalanuvchilar boshqaruvi | ✓ | — | — |
| Sozlamalar | ✓ | — | — |

> Sariq (◐/—) belgilangan ayrim kataklar §11 da tasdiqlashni talab qiladi.

## 6. Asosiy ish jarayonlari (workflows)

**6.1. Kunlik qo'ng'iroq → eskalatsiya → usta**
Texnik xodim qo'ng'iroq qiladi → holat yozadi. **3 martadan ortiq ketma-ket
ko'tarilmasa** yoki joyiga borish kerak bo'lsa → lid **boshliq (admin)
eskalatsiya navbati**ga tushadi → admin ko'rib chiqadi va **ustani biriktiradi**
(tizim viloyat/"Kim o'rnatgan" bo'yicha taklif qiladi, admin o'zgartira oladi) →
lid ustaning "Mening vazifalarim"ida paydo bo'ladi → usta bajaradi → holat
yangilanadi.

**6.2. Texnik muammo (ticket) → usta**
Texnik xodim ticket ochadi → masofadan hal qilolmasa → ustaga biriktiradi →
usta bajaradi → ticket yopiladi → mijoz holati yangilanadi.

**6.3. Yangi o'rnatish**
Admin/xodim yangi mijoz uchun o'rnatish vazifasini ustaga topshiradi → usta
o'rnatadi → mijoz "faol" bo'ladi, obuna boshlanadi.

**6.4. Nazorat**
Admin barcha boardlar, ustalar yuklamasi va hisobotlarni kuzatadi.

## 7. Yangi funksiyalar (qo'shilishi kerak)

1. **Usta portali** — `Mening vazifalarim` sahifasi + holat yangilash.
2. **Vazifa biriktirish mexanizmi** — eskalatsiya qilingan lid/ticketni aniq
   ustaga yo'naltirish (kim biriktiradi — §11).
3. **Rol asosidagi kirish nazorati (RBAC)** — har bir sahifa va amal server
   tomonda rol bo'yicha tekshiriladi (nafaqat menyuni yashirish).
4. **Foydalanuvchilar boshqaruvi (admin)** — xodim/usta yaratish, rol/viloyat
   berish, faol/nofaol qilish, parol tiklash.
5. **Rolga mos asosiy sahifa (redirect)** — har bir rol login'dan keyin o'z
   portaliga tushadi.

## 8. Mavjud tizimga o'zgarishlar

- Rollar: `ADMIN` = Administrator, `OPERATOR` = Texnik bo'lim xodimi,
  `INSTALLER` = Usta (yorliqlar UI da moslashtiriladi).
- Navigatsiya rol bo'yicha to'liq qayta tuziladi (har rol o'z menyusi).
- Ticket/lid biriktirish ustaga ham bo'ladi (hozir asosan operatorga).
- Server action va sahifalarga rol tekshiruvi qo'shiladi (markazlashgan).
- Mijoz kartochkasi va boshqa sahifalar rolga qarab cheklangan ko'rinishda.
- Eskalatsiya (3+ ko'tarilmagan) endi to'g'ridan-FORWARDED emas, **boshliq
  navbati**ga tushadi; lidga `assignedUstaId` (biriktirilgan usta), `User`ga
  `region` va `faollik (isActive)` maydonlari qo'shiladi.
- **Jadval ko'rinishi:** `/lidlar` karta-board o'rniga jadval; `CallLog`
  (`operatorId` + `note` + `calledAt` + `result`) tarix popoveri va xodim
  atributsiyasi uchun qayta ishlatiladi.
- **Maxsus izoh:** `Client`ga `specialNote`, `specialNoteById`, `specialNoteAt`
  maydonlari qo'shiladi (qo'ng'iroqcha indikatori shu bo'yicha chiqadi).
- **Qo'lda eskalatsiya:** "Boshliqqa yo'naltirish" amali lidni `ESCALATED`
  (boshliq navbati) holatiga o'tkazadi.

## 9. Funksional bo'lmagan talablar

- **Xavfsizlik:** ruxsatlar server tomonda majburlanadi; menyu yashirish yetarli
  emas. Ruxsatsiz amal 403 bilan rad etiladi.
- **Audit (ixtiyoriy):** kim qachon qaysi amalni bajargani yoziladi.
- **Til:** o'zbekcha (lotin) interfeys.
- **Mobil:** usta portali telefonda qulay ishlashi kerak (dalada).
- **Kengayuvchanlik:** keyinchalik yangi rol qo'shish oson bo'lsin.

## 10. Bosqichlar (taklif)

- **Faza 1 — RBAC poydevori:** markazlashgan rol tekshiruvi, rolga mos
  navigatsiya va login-redirect, mavjud sahifalarni cheklash.
- **Faza 2 — Usta portali:** `Mening vazifalarim` + holat yangilash + lid/ticket
  ustaga biriktirish (eskalatsiya ulanishi).
- **Faza 3 — Foydalanuvchilar boshqaruvi:** admin UI (xodim/usta CRUD).
- **Faza 4 — Sayqal:** audit jurnali, sozlamalar, hisobotda usta ko'rsatkichlari.

## 11. Kelishilgan qarorlar (v0.2)

1. **Rol mosligi:** bitta rol — *texnik bo'lim xodimi* qo'ng'iroq, to'lov va
   masofaviy texnik ishlarni bajaradi (hozirgi `OPERATOR`). ✅
2. **Ustaga biriktirish: aralash** — tizim avtomatik taklif qiladi (viloyat yoki
   "Kim o'rnatgan" bo'yicha), admin/xodim o'zgartira oladi. ✅
3. **Eskalatsiya yo'li: avval boshliqqa** — 3+ ko'tarilmagan lid admin
   eskalatsiya navbatiga tushadi, admin ustaga taqsimlaydi. ✅
   *(O'zgarish: hozir tizim 3+ da to'g'ridan-to'g'ri FORWARDED qiladi — bu
   "boshliq navbati"ga moslanadi.)*
4. **Foydalanuvchilar boshqaruvi: shu bosqichda** — admin UI orqali xodim/usta
   yaratadi, rol/viloyat beradi, parol tiklaydi. ✅
5. **Texnik xodim hisoboti:** to'liq emas — faqat shaxsiy ko'rsatkichlar
   (bugungi ishlar, o'z yig'imi). *(standart — keyin o'zgartirsa bo'ladi)*
6. **Usta ko'rinishi:** faqat o'z vazifasi + mijoz kontakti (to'lov/hisobot
   ko'rmaydi). *(standart)*
7. **Usta holatlari:** Yo'ldaman / Bordim / Bajarildi / Hal bo'lmadi / Qayta
   kerak. *(standart)*

## 12. Qabul mezonlari (acceptance criteria)

- Har bir rol login qilganda **faqat o'z portali va menyusini** ko'radi.
- Ruxsat etilmagan sahifa/amalga urinish server tomonda **rad etiladi** (403).
- Texnik xodim faqat **o'ziga biriktirilgan** mijoz/lidlarni ko'radi va boshqaradi.
- Usta faqat **o'ziga biriktirilgan vazifalarni** ko'radi, holatini yangilaydi.
- Admin **barcha** ma'lumot, biriktirish va hisobotlarga ega.
- Eskalatsiya qilingan lid/ticket tegishli **ustaning ro'yxatida** paydo bo'ladi.

---

## 13. Telegram integratsiyasi

### 13.1. Hisobotlar (kanalga avtomatik)
- **Kunlik** (har kuni **18:30**, Toshkent UTC+5) — bugungi qo'ng'iroqlar soni,
  to'lov yig'imi, ko'tarmadi/eskalatsiya, operatorlar kesimida.
- **Haftalik** (Dushanba ertalab) — o'tgan hafta xulosasi.
- **Oylik** (1-sana) — MRR, yig'im, churn, eng faol operator/usta.
- **So'rov bo'yicha** — `/hisobot kun|hafta|oy`.

### 13.2. Bot orqali boshqaruv (ruxsatli Telegram ID + rol bo'yicha)
- Yangi xodim qo'shish; parol almashtirish/tiklash; xodimni faolsizlantirish.
- **Kunlik lid sonini** o'zgartirish (doimiy); **bir kunlik qo'shimcha lid**
  berish (faqat o'sha kunga amal qiladi).
- Eskalatsiya navbatini ko'rish va **ustaga biriktirish** (inline tugmalar).

### 13.3. Kunlik lid taqsimoti
Har xodimda `dailyLeadTarget`. Har kuni umumiy "yangi lidlar pool"idan shu
songacha avtomatik to'ldiriladi; qo'shimcha lid `DailyLeadGrant(userId, date,
extraCount)` sifatida faqat o'sha kunga qo'shiladi.

**Avtomatik kunlik yangilanish (00:00, UTC+5):** yarim tunda tizim avtomatik —
(1) bugun yakunlanmagan lidlarni holatiga ko'ra ko'chiradi (avto "Kunni
yakunlash"), (2) har xodimga kunlik songacha lid to'ldiradi, (3) bir kunlik
bonus (`DailyLeadGrant`) larni o'chiradi. Qo'lda "Kunni yakunlash" tugmasi ham
qoladi (erta yakunlash uchun).

### 13.4. Qo'shimcha imkoniyatlar (taklif)
- Tezkor bildirishnoma: eskalatsiya / maxsus izoh / muddati o'tgan to'lov.
- Operatorga shaxsiy DM: ertalab "Bugun N ta lid" + bajarilmaganlar eslatmasi.
- Inline tugmalar bilan boshqaruv (eskalatsiyani biriktirish).
- Audit jurnali: bot amallari (kim/nima/qachon).
- Web sozlamalar: admin bot token, kanal ID, hisobot vaqtlari, default kunlik son.

### 13.5. Ma'lumotlar modeli va infratuzilma
- `User` → `telegramId`, `dailyLeadTarget`.
- Yangi `DailyLeadGrant(userId, date, extraCount)`.
- `Settings`/env → bot token, kanal ID, hisobot vaqtlari, default kunlik son.
- Bot **long-polling** (lokalda ham ishlaydi); doimiy ishlash uchun deploy
  (VPS, always-on). Talab: @BotFather token + kanalga bot admin.
- **Token keyin ulanadi:** env'da token bo'lmasa, Telegram yuborish o'rniga
  **log (mock) rejim** ishlaydi — kod tayyor bo'ladi, jonli ulanish keyinroq.
- Rejalashtirilgan ishlar (18:30 hisobot, 00:00 yangilanish) **scheduler**
  (node-cron) orqali; doimiy ishlash deploy bilan ta'minlanadi.

### 13.6. Bosqich
**Faza 7 — Telegram integratsiyasi** (Ombordan keyin; hozircha kechiktirildi).

---

## 14. Ombor (inventar) moduli

### 14.1. Maqsad
Texnikalar (printer, monoblok, WiFi router) harakatini kuzatish: **ombor → usta
→ mijoz**, va ijara mijoz ketganda **avtomatik qaytarish**. Omborni **texnik
bo'lim boshlig'i** (MANAGER) yuritadi.

### 14.2. Texnika turlari va narx
- **Printer**, **Monoblok**, **WiFi router**.
- Narxlar **standart** (barcha mijozlar uchun bir xil); boshqaruvchi tahrirlaydi.
- Model: `EquipmentType { name, price }`.

### 14.3. Mijoz – texnika munosabati
Har bir mijoz uchun uch xil holat:
- **Ijara** — texnikani ijaraga olgan (biz egamiz),
- **Sotib olingan** — texnikani sotib olgan (mijoz egasi),
- **Dastur (texnikasiz)** — faqat dasturni ishlatadi.
Mijozda qaysi va qancha texnika borligi qayd etiladi (`ClientEquipment`,
ownership = RENTAL | SOLD). `Client.equipmentMode` umumiy holatni saqlaydi.

### 14.4. Inventar joylashuvi (miqdor bo'yicha)
- **Ombor** (markaziy zaxira) · **Usta** (viloyat bo'yicha dala zaxirasi) ·
  **Mijoz** (o'rnatilgan). Har bir harakat jurnalga yoziladi
  (`EquipmentMovement`: qayerdan → qayerga, miqdor, sabab, kim, qachon).

### 14.5. Asosiy oqimlar
1. **Kirim:** boshliq omborga texnika qo'shadi.
2. **Ombor → Usta:** boshliq ustaga zaxira beradi (viloyat bo'yicha).
3. **O'rnatish (Usta → Mijoz):** usta vazifani bajarganda o'rnatilgan texnikani
   qayd etadi (ijara yoki sotuv); texnika usta zaxirasidan mijozga o'tadi.
4. **Avto-qaytarish (asosiy qoida):** **ijara** mijoz **faolsizlantirilsa**, unga
   tegishli ijara texnikalari avtomatik **biriktirilgan ustaning hisobiga**
   o'tadi va ustaga **"texnikani olib kelish"** vazifasi yaratiladi. Usta borib
   oladi → tasdiqlaydi → texnika usta zaxirasiga (yoki omborga) kiradi.

### 14.6. Ruxsatlar (qisqacha)
- **MANAGER (boshliq):** ombor to'liq (kirim, taqsimlash, narx), eskalatsiya,
  hisobot, mijozlar/muammolar.
- **Usta:** o'z zaxirasi va olib-kelish vazifalarini ko'radi/yangilaydi.
- **Admin:** hammasi. **Texnik xodim:** omborni ko'rmaydi (faqat mijoz texnika
  holatini ko'rishi mumkin).

### 14.7. Hisobot
Ombor qoldig'i va **qiymati** (miqdor × narx), usta zaxiralari, mijozlarda
o'rnatilgan texnika, kutilayotgan qaytarishlar.

### 14.8. Ma'lumotlar modeli
`EquipmentType` (name, price); `InventoryStock` (locationType WAREHOUSE|USTA,
locationId, equipmentTypeId, quantity); `ClientEquipment` (clientId,
equipmentTypeId, quantity, ownership); `EquipmentMovement` (jurnal);
`Client.equipmentMode` (RENTAL|SOLD|PROGRAM_ONLY); yangi rol `MANAGER`.

### 14.9. Bosqich
**Faza 6 — Ombor moduli** (6a poydevor tugadi; 6b quyidagilar).

### 14.10. Qo'shimcha talablar (v0.4)
- **Markaziy ombor** — uskunalar markaziy omborda saqlanadi (mavjud).
- **Brak (yaroqsiz)** — uskuna brakka chiqarilishi mumkin (yangi joylashuv BRAK).
  Ombordan ustaga, hamda ombor/ustadan brakka o'tkazishda **izoh majburiy**.
- **Narx — ijara va sotuv alohida** — har texnika turida `rentalPrice` (ijara
  oylik) va `salePrice` (sotuv) narxi (`EquipmentType.price` o'rniga).
- **Oylik hisob** — mijozga uskuna biriktirilganda:
  - **Ijara:** mijoz oylik to'loviga `rentalPrice × soni` **qo'shiladi** (har oy;
    qaytarilganda ayiriladi).
  - **Sotuv:** `salePrice` — *(tasdiqlash: bir martalik / oylikka qo'shiladi)*.
- **Qaytarish jarayoni (yangilangan):** TP xodimi mijoz bilan gaplashib
  **"uskunani qaytarish"**ni belgilaydi + **izoh (ariza)** → ariza **managerga**
  yuboriladi → manager **tasdiqlaydi** → mijoz **viloyati bo'yicha avtomatik
  ustaga** biriktiriladi → usta borib oladi, **tasdiqlaydi** → texnika usta
  zaxirasiga (yoki omborga) kiradi, ijara haqi oylikdan ayiriladi.
  *(Bu §14.5.4 dagi "o'chganda avto" qoidasini almashtiradi/aniqlashtiradi.)*
- **Ustalarni boshqarish** — yangi usta qo'shish, **edit/delete**, viloyat
  biriktirish: **admin va manager** orqali (alohida "Ustalar" sahifasi).

### 14.11. Ma'lumotlar modeli (qo'shimcha)
- `EquipmentType`: `price` → **`rentalPrice` + `salePrice`**.
- `InventoryStock.locationType`: WAREHOUSE | USTA | **BRAK**.
- `EquipmentMovement.note` (izoh — ombor→usta, →brak da majburiy).
- Yangi `EquipmentReturnRequest { clientId, byUserId, note, status
  (PENDING|APPROVED|REJECTED|DONE), ustaId?, createdAt }`.

---

*Keyingi qadam: §14 (Ombor) va yangi MANAGER roli tasdiqlangach, texnik dizayn va
coding o'zgarishlari boshlanadi. Telegram (F7) keyinga qoldirildi.*
