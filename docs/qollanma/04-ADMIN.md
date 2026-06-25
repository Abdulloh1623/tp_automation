# Administrator — to'liq qo'llanma

> **Kim uchun:** butun tizimni boshqaradigan rahbar — foydalanuvchilar, import, audit,
> backup va barcha bo'limlar.
> **Login namunasi:** `admin` · **Asosiy sahifa:** Boshqaruv paneli.

Admin **barcha bo'limlarga** kiradi. Quyida faqat **adminga xos** bo'limlar batafsil
yoritilgan. Boshqa bo'limlar uchun tegishli qo'llanmaga qarang:
[Operator](01-OPERATOR.md) (Kunlik ish, Mijozlar, To'ldirilmagan, Muammolar),
[Manager](03-MANAGER.md) (Ombor, Ustalar, Eskalatsiya, To'lovlar, Hisobot, Vazifalar),
[Usta](02-USTA.md) (Vazifalar).

---

## 1. Boshqaruv paneli (bosh sahifa)

Faqat admin ko'radi. Yuqorida 6 ta bosiladigan ko'rsatkich:

| Karta | Ma'nosi | Bosilsa |
|------|---------|---------|
| **Faol mijozlar** | Status = Faol | Mijozlar (faol filtri) |
| **Bugun qo'ng'iroq** | Bugun aloqa kerak bo'lganlar | — |
| **Muddati o'tgan to'lov** | Qarzdorlar soni | — |
| **Oylik daromad (USD)** | Faol mijozlar oylik yig'indisi | — |
| **Biriktirilmagan mijozlar** | Operatori yo'q mijozlar | Mijozlar → biriktirilmagan |
| **To'ldirilmagan ma'lumot** | Telefon/restoran nomi yo'q | To'ldirilmagan sahifasi |

Pastda **Bugungi ish ro'yxati:** to'lov kuni yetgan, rejalashtirilgan qo'ng'iroq yoki
ochiq muammosi bor mijozlar (sabab belgilari bilan), har biriga **Ochish** tugmasi.

> Ikki sariq karta (**Biriktirilmagan**, **To'ldirilmagan**) — kundalik nazorat uchun:
> raqam 0 dan katta bo'lsa, bosib tegishli ro'yxatga o'ting va tartibga soling.

---

## 2. Foydalanuvchilar

Barcha xodimlar: Ism, Login, Rol, Viloyat, Kunlik (lid normasi), Telegram, Holat.

### 2.1. Yangi xodim
- **Ism**, **Login** (kamida 3 belgi, takrorlanmas), **Parol** (kamida 4 belgi) — majburiy.
- **Rol** — Administrator / Texnik bo'lim boshlig'i / Texnik xodim / Usta.
- **Viloyat**, **Telefon** — ixtiyoriy.
- **Kunlik lid** — operator uchun kunlik qo'ng'iroq normasi (standart 20).

> Login band bo'lsa: "Bu login band"; parol qisqa bo'lsa: "Parol kamida 4 belgi".

### 2.2. Tahrirlash / parol / faollik
- **Tahrir** — ism, rol, viloyat, telefon, kunlik lid, **Telegram ID**.
- **Parol** — parolni tiklash (kamida 4 belgi).
- **O'chirish / Yoqish** — xodimni faolsizlantirish yoki qayta yoqish. Faolsiz xodim
  tizimga kira olmaydi (qatori xira ko'rinadi).

### 2.3. Telegram ID
Xodim botga `/start` yozganda bot uning **Telegram ID**sini ko'rsatadi. Shu ID'ni
xodim profiliga kiritsangiz, u botdan foydalana oladi (**faqat Admin/Manager** bot
amallarini bajara oladi).

---

## 3. Import (CSV / Excel)

Faqat admin. Ko'p mijozni bir vaqtda qo'shish/yangilash.

### 3.1. Bosqichlar
1. **Fayl yuklash** — `.csv` faylni tanlang **yoki** CSV matnini joylashtirib
   **Tahlil qilish**.
2. **Ustunlarni moslash** — har maydonga CSV ustunini biriktiring. Tizim avtomatik
   taklif qiladi. Majburiy: **FIO**, **Restoran nomi**, **Telefon** (`*`).
   Ixtiyoriy: viloyat, qo'shimcha telefon, shartnoma raqami/sanasi, kim o'rnatgan,
   monoblok soni, apparat, oylik summa, valyuta, keyingi to'lov, holat.
3. **Oldindan ko'rish** — birinchi 5 qator moslangan ko'rinishda.
4. **Rejim:**
   - **Faqat yangi qo'shish** — mavjud telefon o'tkazib yuboriladi (xato sifatida).
   - **Telefon bo'yicha yangilash** — telefon mos kelsa mijoz yangilanadi, aks holda
     qo'shiladi.
   - **Standart valyuta** — currency ustuni bo'lmasa qo'llaniladi (USD/UZS).
5. **Natija** — qo'shilgan / yangilangan / o'tkazilgan soni + xatolar ro'yxati
   (qator raqami bilan).

### 3.2. Avtomatik tushunish (parse)
- **Telefon dedup** — faqat raqamlar bo'yicha solishtiriladi (`+998 (90) 123-45-67`
  → `998901234567`).
- **Raqamlar:** `1.500.000` → 1500000, `1,5` → 1.5, `450 000` → 450000.
- **Sanalar:** `DD.MM.YYYY`, `DD.MM.YY`, `YYYY-MM-DD` va h.k.
- **Valyuta:** "so'm/uzs/сум" → UZS; "usd/$/dollar" → USD.
- **Holat:** "o'chir/inactive" → INACTIVE; "kutil/pending" → PENDING; aks holda ACTIVE.
- Bir martada **5000 qatorgacha**.

> Real bazani Google Sheet'dan import qilish uchun alohida skript ham bor:
> `scripts/import-sheet.ts` (kunlik commentlarni o'zlashtirmaydi).

---

## 4. Audit jurnali

Barcha amallar (oxirgi 200 ta): **Vaqt**, **Foydalanuvchi**, **Amal**, **Obyekt**,
**Tafsilot**. Login/chiqish, mijoz, to'lov, uskuna, qo'ng'iroq, foydalanuvchi va h.k.

### 4.1. "Hozir backup" tugmasi
Darhol zaxira nusxa yaratadi:
- `prisma/dev.db` (asosiy baza) + `uploads/receipts/` (cheklar) → `backups/<sana>/`.
- Eski nusxalar tozalanadi (oxirgi **14** kun saqlanadi).
- Baza Telegram **zaxira kanaliga** yuboriladi.
- Natija: "Backup tayyor: <sana> (cheklar: N, Telegram: yuborildi)".

---

## 5. Telegram bot va kanallar

Bot: **@biznexautobot**.

### 5.1. Ulanish
1. Botga `/start` → bot Telegram ID'ingizni ko'rsatadi.
2. Admin shu ID'ni profilingizga kiritadi (faqat Admin/Manager foydalanadi).
3. Qayta `/start` → menyu.

### 5.2. Bot menyusi
- ➕ **Xodim qo'shish** (rol → ism → login → parol → viloyat).
- 🔑 **Parol o'zgartirish**.
- 📊 **Kunlik lid soni** o'zgartirish.
- 📅 **1 kunlik qo'shimcha lid** berish.
- 📈 **Hisobot yuborish** (kunlik/haftalik/oylik).

### 5.3. Kanallar (avtomatik)
- **Hisobot kanali** — kunlik 18:30, haftalik (Dushanba 09:00), oylik (1-kun 09:00).
- **To'lovlar kanali** — har to'lovda mijoz + summa + sana + chek.
- **Zaxira kanali** — har kuni 03:00 baza nusxasi.

> Bu avtomatik funksiyalar uchun **worker** (`npm run bot`) doimo ishlab turishi kerak.

---

## 6. Tizimni ishga tushirish

- **`start.bat`** — kutubxonalar, baza, loyihani tayyorlaydi va **Server (3100)** hamda
  **Telegram bot** oynalarini ochadi, brauzerni ochadi.
- **To'xtatish** — ikkala oynani yopish.
- **`build.bat`** — kodga o'zgartirish kiritilganda qayta qurish.
- Ishlab chiqish (dev) rejimi: `npm run dev` (avtoyangilanish bilan).

---

## 7. Foydalanuvchi nazorati — kundalik tartib
1. **Boshqaruv paneli**dagi "Biriktirilmagan" va "To'ldirilmagan" raqamlarini tekshiring.
2. **Audit**dan g'ayrioddiy amallarni kuzating.
3. Vaqti-vaqti bilan **Hozir backup** bosing (avtomatik backupdan tashqari).
4. Yangi xodimga eng kam zarur **rol**ni bering (operatorga admin huquqi bermang).

---

## 8. Barcha rollar ko'radigan umumiy elementlar
- **Chap menyu** — rolga ruxsat etilgan bo'limlar.
- **Telefon raqamlari** ko'k — bosilsa qo'ng'iroq.
- **Qidiruv** — yozayotganda avtomatik (mijozlar).
- Har muhim amal **audit**ga yoziladi.
- **Toast** bildirishnomalar — saqlash/biriktirishda o'ng pastda chiqadi.
- Telefon ekranida jadvallar **karta** ko'rinishiga o'tadi.
