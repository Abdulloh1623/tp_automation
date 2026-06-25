# Operator (Texnik xodim) — to'liq qo'llanma

> **Kim uchun:** mijozlarga har kuni qo'ng'iroq qiladigan, to'lov qabul qiladigan va
> muammolarni qayd etadigan xodim.
> **Login namunasi:** `asadbek` · **Asosiy sahifa:** Kunlik ish.

Sizga ko'rinadigan bo'limlar: **Kunlik ish**, **Mijozlar**, **To'ldirilmagan**, **Muammolar**.

---

## 1. Tizimga kirish

1. Brauzerda **http://localhost:3100** ni oching.
2. Login va parolni kiriting → **Kirish**.
3. To'g'ridan-to'g'ri **Kunlik ish** sahifasiga tushasiz.
4. Chiqish: chap menyu pastida (telefonda — yuqori o'ngda) **Chiqish**.

> 5 marta noto'g'ri parol kiritsangiz, hisobingiz **15 daqiqaga** bloklanadi.
> Parolingizni o'zgartirish kerak bo'lsa — administratorga ayting.

---

## 2. Kunlik ish (asosiy sahifangiz)

Bu — Google Sheets uslubidagi jadval. Har bir qator = bitta mijoz. Bu yerda faqat
**sizga biriktirilgan** va **bugun aloqa qilinishi kerak** bo'lgan mijozlar chiqadi.

### 2.1. Ikki ko'rinish: Joriy / Tarix
- **Joriy** — bugun bajariladigan ishlar (asosiy rejim).
- **Tarix** — o'tgan kunlardagi natijalar kun ustunlari bo'yicha (har katakni bosib
  o'sha kungi izohni ko'rasiz).

### 2.2. Jadval ustunlari (Joriy)
| Ustun | Ma'nosi |
|------|---------|
| **Restoran / FIO** | Mijoz nomi va egasi. Yonida 🔔 bo'lsa — maxsus izoh bor (bosib o'qing). |
| **Viloyat** | Mijoz viloyati |
| **Telefon** | Ko'k — bosilsa qo'ng'iroq qilinadi (`+998 90 481 43 75` ko'rinishida) |
| **K.** | Ketma-ket necha marta **ko'tarmagani**. 3 ga yetsa qator qizaradi. |
| **Bo'lim** | Lidning hozirgi bosqichi (Yangi, Keyinroq, To'lov kutilmoqda...) |
| **Oxirgi aloqa** | Oxirgi qo'ng'iroq sanasi |
| **To'lov** | Oylik summa + keyingi to'lov sanasi. Muddati o'tgan bo'lsa **Qarzdor (N kun)** qizil belgisi. |
| **Bugun** | Bugungi natijani tanlaysiz (dropdown) |
| **Izoh** | Bugungi qisqa izoh (avtomatik saqlanadi) |
| **Amallar** | Maxsus / Boshliqqa tugmalari |

> **Qatorlar rangi:** qizil fon — 3+ marta ko'tarmagan; sariq fon — qarzdor.
> Bularga birinchi navbatda e'tibor bering.

### 2.3. Qo'ng'iroq natijasini belgilash (asosiy ish)
1. Mijozga qo'ng'iroq qiling (telefon raqamini bosing).
2. **Bugun** ustunidagi ro'yxatdan natijani tanlang:
   - **Ko'tarmadi**, **Telefon o'chiq**, **Band (zaynit)**
   - **Keyinroq tel qilish**, **To'lov qiladi**, **Ertaga to'lov qiladi**
   - **Oylik to'lov eslatildi**, **Muammo bor**, **Muammo yo'q**
   - **To'lov qildi**, **Muammo hal qilindi**, **O'chirib qo'ydi**
3. **Izoh** ustuniga qisqacha yozing — fokus chiqishi bilan **"saqlandi"** belgisi chiqadi.

> Sana tanlamaysiz — tizim natijaga qarab mijozni keyingi bosqichga o'tkazadi va
> **keyingi aloqa kunini o'zi belgilaydi**.

### 2.4. "To'lov qildi" — chek bilan (majburiy)
"To'lov qildi" tanlansa **chek oynasi** ochiladi:
1. Summa avtomatik qo'yiladi (mijozning oylik to'lovi) — tekshiring; valyuta va sanani belgilang.
2. **Chek rasmini** ikki yo'l bilan qo'shing:
   - **Fayl yuklash** — rasmni tanlang, **yoki**
   - **Clipboarddan** — rasmni nusxalab (Ctrl+C), oynaga **Ctrl+V**.
3. Chek **majburiy** — usiz to'lov saqlanmaydi.
4. **Tasdiqlash** → to'lov yoziladi va mijoz ma'lumoti + summa + sana + chek avtomatik
   **to'lovlar kanaliga (Telegram)** yuboriladi.

### 2.5. 3 marta ko'tarmasa — avtomatik eskalatsiya
Mijoz **3 martadan ortiq ketma-ket** ko'tarmasa, lid avtomatik **boshliq navbatiga**
(eskalatsiya) o'tadi va sizning ro'yxatingizdan chiqadi.

### 2.6. Boshqa amallar
- **Maxsus** tugmasi — doimiy muhim eslatma qo'shadi (masalan: "faqat kechqurun
  qo'ng'iroq qiling"). Mijoz nomi yonida 🔔 ko'rinadi, hamma operatorlar ko'radi.
- **Boshliqqa** tugmasi — muammoli mijozni qo'lda boshliq navbatiga yuborish.
- **Excel** — jadvalni faylga yuklab olish.
- **Kunni yakunlash** — kun oxirida bosing; bugungi natijalarga ko'ra lidlar yangi
  bosqichlarga ko'chadi.
- **Qidirish** — yuqoridagi maydon orqali restoran/FIO/telefon/viloyat bo'yicha.

### 2.7. Telefonda ishlash
Telefon ekranida jadval o'rniga qulay **kartalar** ko'rinadi: har kartada nom, telefon
(bosib qo'ng'iroq), bo'lim, natija tanlash, izoh va Maxsus/Boshliqqa tugmalari.

---

## 3. Mijozlar bo'limi

### 3.1. Ro'yxat va qidiruv
- **Qidiruv** — yozayotganda avtomatik qidiradi (FIO, restoran, telefon, shartnoma).
- **Filtrlar** — Viloyat va Holat bo'yicha (o'zgartirsangiz darhol filtrlaydi).
- **Saralash** — ustun sarlavhasini bosing (Mijoz, Viloyat, Oylik, Keyingi to'lov).
- Ro'yxat **50 tadan** sahifalanadi — pastdan Oldingi/Keyingi.
- Telefonda har mijoz karta ko'rinishida.

### 3.2. Yangi mijoz qo'shish
**Yangi mijoz** → forma:
- **FIO**, **Restoran nomi**, **Asosiy telefon** — majburiy.
- Viloyat, shartnoma raqami/sanasi, oylik summa, valyuta va h.k. — ixtiyoriy.
- **Telefon qo'shish** — yorliqli qo'shimcha raqamlar (Egasi, Menejer, Kassir,
  Buxgalter...). Asosiy telefon qo'ng'iroq va qidiruv uchun ishlatiladi.

### 3.3. Mijoz kartochkasi
Mijoz ustiga bosing — to'liq ma'lumot:
- **Ma'lumotlar:** asosiy + barcha qo'shimcha telefonlar (har biri bosib qo'ng'iroq),
  viloyat, kim o'rnatgan, shartnoma, monoblok soni, mas'ul operator.
- **Qo'ng'iroq jurnali:** yangi qo'ng'iroq yozish + butun tarix.
- **Muammolar:** shu mijozga ariza ochish.
- **Obuna va to'lov:** oylik, keyingi to'lov, holat + **To'lov qabul qilish** (summa +
  chek (majburiy) → yuboriladi).

---

## 4. To'ldirilmagan mijozlar

Ma'lumoti to'liq bo'lmagan (telefon yoki restoran nomi yo'q) mijozlar shu yerda.

- Har bir qatorda **joyida** restoran nomi, telefon va viloyatni kiritib **Saqlash**
  tugmasini bosasiz (alohida sahifaga o'tish shart emas).
- Ma'lumot to'liq bo'lishi bilan mijoz ro'yxatdan **avtomatik chiqadi**.
- Telefonda har biri karta ko'rinishida.

> Maqsad: importdan keyin yetishmaydigan ma'lumotlarni tez to'ldirish.

---

## 5. Muammolar (ticket)

Mijoz kartochkasida yoki **Muammolar** menyusida ariza ochasiz:
- **Mijoz**, **Muammo** (sarlavha), **Turi** (Texnik / Funksiya so'rovi / To'lov / Soliq),
  **Ustuvorlik** (Past / O'rta / Yuqori) → **Muammo qo'shish**.
- Holatlar: **Ochiq → Jarayonda → Hal qilindi**.
- Filtr orqali holat/tur/ustuvorlik bo'yicha ko'rasiz.

---

## 6. Tez maslahatlar
- Kun boshida **qizil va sariq** qatorlardan boshlang (ko'tarmaganlar va qarzdorlar).
- Har qo'ng'iroqdan keyin **izoh** yozib qo'ying — keyingi kuni kim qo'ng'iroq qilsa
  ham vaziyatni tushunadi.
- To'lov chek**siz** saqlanmaydi — har doim chek rasmini tayyorlab turing.
- Kun oxirida **Kunni yakunlash**ni unutmang.
