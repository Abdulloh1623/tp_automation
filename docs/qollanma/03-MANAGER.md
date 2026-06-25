# Texnik bo'lim boshlig'i (Manager) — to'liq qo'llanma

> **Kim uchun:** omborni, ustalarni, eskalatsiyani va texnik jarayonlarni boshqaradigan,
> hisobotlarni kuzatadigan rahbar.
> **Login namunasi:** `boshliq` · **Asosiy sahifa:** Ombor.

Sizga ko'rinadigan bo'limlar: **Kunlik ish**, **Vazifalar**, **Ombor**, **Ustalar**,
**Mijozlar**, **To'ldirilmagan**, **To'lovlar**, **Muammolar**, **Eskalatsiya**, **Hisobot**.

---

## 1. Ombor

Yuqorida ko'rsatkichlar (kartalar):

| Karta | Ma'nosi |
|------|---------|
| **Omborda (dona)** | Omborda mavjud texnika soni |
| **Ombor qiymati ($)** | Ombordagi texnika sotuv narxidagi qiymati |
| **Mijozlarda (dona)** | Mijozlarga joylashtirilgan uskunalar |
| **Ijara daromadi ($/oy)** | Ijaraga berilган uskunalardan oylik daromad |
| **Ustalarda (dona)** | Ustalar zaxirasidagi texnika |
| **Kutilayotgan qaytarish** | Tasdiqni kutayotgan qaytarish arizalari |

### 1.1. Ombor qoldig'i va narxlar
Har texnika turi (Printer, Monoblok, WiFi router) uchun:
- **Ijara narx (oylik)** va **Sotuv narx** — maydonni tahrirlab, boshqa joyga bossangiz
  avtomatik saqlanadi.
- **Omborda** — joriy qoldiq (faqat ko'rsatish).

> Joriy narxlar: Monoblok ijara **$25**/oy, Printer **$2.5**, WiFi router **$2**.

### 1.2. Omborga kirim
**Texnika** + **Miqdor** → **Kirim**. Yangi kelgan texnikani omborga qo'shadi.

### 1.3. Ustaga taqsimot
**Texnika** + **Usta** + **Miqdor** + **Izoh (majburiy)** → **Berish**.
Texnika ombordan tanlangan ustaning zaxirasiga o'tadi.

### 1.4. Brakka chiqarish
**Manba** (Ombor yoki aniq Usta) + **Texnika** + **Miqdor** + **Izoh/sabab (majburiy)**
→ **Brakka chiqarish**. Yaroqsiz texnikani hisobdan chiqaradi. Pastda brakdagi
texnika ro'yxati ko'rinadi.

### 1.5. Usta zaxiralari
Har bir ustada qaysi texnikadan qancha borligi ro'yxati.

### 1.6. Qaytarish arizalari (panel)
Operator/usta yuborgan "uskuna olib kelish" arizalari:
- Har arizada: restoran, viloyat, izoh va **viloyat bo'yicha tavsiya etilgan usta**.
  (Viloyatда faol usta bo'lmasa — qizil ogohlantirish.)
- **Tasdiqlash** → olib kelish vazifasi avtomatik o'sha ustaga biriktiriladi (usta
  o'z Vazifalar sahifasida ko'radi).
- **Rad etish** → ariza bekor qilinadi.

---

## 2. Ustalar

Ustalar (dala texniglar) ro'yxati: Ism, Login, Viloyat, Telefon, Holat.

- **Yangi usta** — Ism, Login, Parol (majburiy) + Viloyat, Telefon (ixtiyoriy).
- **Tahrir** (✏️) — ism, viloyat, telefon.
- **Parol** (🔑) — yangi parol (kamida 4 belgi).
- **Faolsiz / Yoqish** — ustani vaqtincha bloklash yoki qayta yoqish.
- **O'chir** (🗑) — bog'liqlik (mijoz/zaxira) bo'lsa o'chirib bo'lmaydi, faqat
  faolsizlantiriladi.

> **Viloyat muhim:** qaytarish arizasi va eskalatsiyada uskuna/vazifa **mijoz
> viloyatidagi ustaga** avtomatik tavsiya/biriktiriladi.

---

## 3. Eskalatsiya

Boshliq navbatiga tushgan lidlar: **3+ marta ko'tarilmagan** yoki operator qo'lda
**Boshliqqa** yuborgan mijozlar.

Har lidda: restoran, FIO, viloyat, telefon, operator, necha marta ko'tarmaganligi va
muhim izohlar (maxsus izoh + oxirgi qo'ng'iroq izohi). Pastda:
- **Usta** dropdown — viloyatga mos usta **"(taklif)"** bilan ko'rsatiladi.
- **Ustaga izoh** (ixtiyoriy) → **Biriktirish**.

Biriktirilgach mijoz ustaning Vazifalar sahifasiga **O'rnatish / xizmat** sifatida tushadi.

---

## 4. Vazifalar
Ustalar bilan bir xil ko'rinish, lekin yuqorida **Usta tanlash filtri** bor —
istalgan ustaning vazifalarini ko'rishingiz mumkin (Usta → **Ko'rish**).
Bo'limlar: **Uskuna qaytarish** va **O'rnatish / xizmat** (batafsil — Usta qo'llanmasida).

---

## 5. Mijozlar (+ uskuna biriktirish)

Mijozlar ro'yxati operatorникidek (qidiruv, filtr, saralash, sahifalash — 50 tadan).
Sizда qo'shimcha:

### 5.1. Operatorga ommaviy biriktirish
- Har qator boshida **belgilash katakchasi** (checkbox). Bir nechta mijozni belgilang
  (yoki sarlavhadagi katakcha bilan hammasini).
- Yuqorida ko'k panel chiqadi: **operatorni tanlang** → **Biriktirish**.
  ("— Biriktirishni olib tashlash" — biriktirishni bekor qiladi.)
- **Operator filtri**да **Biriktirilmagan** ni tanlab, operatorsiz mijozlarni topib,
  tezda taqsimlaysiz.

### 5.2. Mijoz kartochkasida — Uskunalar
Faqat manager/admin ko'radi:
- **Texnika** + **egalik (Ijara yoki Sotuv)** + **Miqdor** → **Biriktirish**.
- **Ijara** → oylik to'lovga qo'shiladi (kartochkada "Jami oylik" = asos obuna + ijara).
- **Sotuv** → bir martalik to'lov sifatida yoziladi.

---

## 6. To'lovlar

Faqat **faol** mijozlar to'lov holati bo'yicha. Yuqorida 3 ko'rsatkich:
- **Muddati o'tgan** (qizil) — soni + USD yig'imi.
- **Bugun to'lov kuni** (sariq) — soni.
- **Bu oy yig'ilgan (USD)** (yashil) — oy boshidan to'plangan.

Jadval shoshilinch bo'yicha tartiblanadi: muddati o'tgan → bugun → yaqin → yaxshi.
Ustunlar: Mijoz, Holat, Keyingi to'lov, **Qoldi** (kun), Oylik, Operator, **To'lov**
(mijoz kartochkasiga o'tish).

---

## 7. Muammolar (ticket)
- **Filtr:** Holat (Ochiq/Jarayonda/Hal qilindi), Tur (Texnik/Funksiya/To'lov/Soliq),
  Ustuvorlik (Past/O'rta/Yuqori).
- Har ariza kartasida turi/ustuvorlik/holat belgilari, mijoz havolasi, sana, mas'ul.
- **Status boshqaruvi:** Ochiq → **Jarayonga olish** → **Hal qilindi** (yechim izohi
  bilan). Kerak bo'lsa **Qayta ochish**.
- O'ngда **Yangi muammo** formasi.

---

## 8. Hisobot

Yuqorida 7 KPI: Jami mijozlar, Faol mijozlar, **MRR (oylik daromad)**, Bu oy yig'ilgan,
**Qarzdorlar** (soni + summa), Ochiq muammolar, O'chirilgan (churn %).

Pastda tahlillar:
- **Viloyatlar bo'yicha mijozlar** (ustun diagramma).
- **Holat taqsimoti** (Faol/Kutilmoqda/O'chirilgan).
- **Operatorlar (bu oy):** biriktirilgan mijoz, qo'ng'iroqlar, yig'im, ochiq muammo.
- **Ustalar:** faol va bajarilgan vazifalar.
- **Qo'ng'iroq natijalari (bu oy):** natijalar taqsimoti.

Tugmalar:
- **PDF hisobot** — ko'p sahifali PDF: KPI, bugungi qo'ng'iroq natijalari, grafiklar va
  **muammoli mijozlar (izohlari bilan)**.
- **Kunlik / Haftalik / Oylik** — grafik hisobotni darhol Telegram kanaliga yuboradi.

---

## 9. Kunlik ish va To'ldirilmagan
Operatordagidek ishlaydi (batafsil — Operator qo'llanmasida). Boshliq sifatida ham
qo'ng'iroq qilib natija belgilashingiz va ma'lumotlarni to'ldirishingiz mumkin.

---

## 10. Tez maslahatlar
- Har kuni **Ombor → Qaytarish arizalari** va **Eskalatsiya** navbatini tekshiring.
- Importdan keyin **Mijozlar → Operator filtri → Biriktirilmagan** orqali mijozlarni
  operatorlarga taqsimlang (aks holda ular hech kimning kunlik ro'yxatiga tushmaydi).
- Ustaga taqsimot va brakka chiqarishda **izoh majburiy** — sababini aniq yozing.
- Hisobotni haftada bir Telegramga yuborib turing.
