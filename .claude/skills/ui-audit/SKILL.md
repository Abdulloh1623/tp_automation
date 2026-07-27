---
name: ui-audit
description: Ekran/forma/sahifani foydalanuvchi nuqtai nazaridan ko'rib chiqib, chalkashlik va nomuvofiqliklarni topadi va tuzatadi. "UI ni tekshir", "shu formani ko'rib chiq", "chalkash joylari bormi", "UX audit", skrinshot yuborilganda yoki yangi forma/sahifa qo'shilgandan keyin ishlatiladi.
---

# UI/UX audit — TP Automation

Maqsad: ekranni **foydalanuvchi ko'zi bilan** o'qib chiqib, uni chalkashtiradigan
joylarni topish. Kod ishlayotgani yetarli emas — forma "nima qilishini"
aytmasa yoki o'zi bilan ziddiyatga tushsa, bu xato hisoblanadi.

## Qanday ishlanadi

1. **Ekranni aniqlang.** Foydalanuvchi sahifa nomini aytsa (`/tolovlar`, "mijoz
   profili → Uskunalar"), tegishli komponentni toping. Skrinshot berilgan
   bo'lsa — undagi har bir matnni kodda topib solishtiring.
2. **Quyidagi ro'yxat bo'yicha** har bir bandni tekshiring.
3. **Hisobot bering:** raqamlangan ro'yxat, har biri uchun —
   *nima noto'g'ri* → *nega foydalanuvchini chalkashtiradi* → *tuzatish*.
4. Foydalanuvchi "tuzat" desa (yoki audit tuzatish bilan buyurilgan bo'lsa) —
   tuzating, `tsc` + `npm test` + `npm run build` bilan tekshiring va PR oching.

## Tekshirish ro'yxati

Har bandning yonida — shu loyihada **haqiqatan uchragan** misol (PR #162).

### 1. Ziddiyatli holatlar
Ikki element bir vaqtda qarama-qarshi narsa aytmayaptimi?
- `disabled` qilingan tanlovchi eski qiymatini ko'rsatib turibdimi? (Misol:
  "Allaqachon o'rnatilgan" belgilanganda manba select'i o'chirilgan, lekin
  ekranda "Sklad (ombor)" yozuvi qolgan → forma bir vaqtda "ombordan olinadi"
  va "allaqachon mijozda" deb turgan.)
- **Tuzatish naqshi:** o'chirilgan tanlovchi o'rniga holatni ochiq aytadigan
  matn qo'ying ("Mijozda — hech qayerdan olinmaydi").

### 2. Yordamchi matn qaysi elementga tegishli
Izoh o'zi tushuntirayotgan elementning **yonida** turibdimi?
- Manba qoidasi checkbox ostida turgan edi → foydalanuvchi uni checkbox izohi
  deb o'qiydi.
- **Tuzatish:** matnni tegishli input/select ostiga ko'chiring.

### 3. Cheklovlar ko'rinadimi va majburlanadimi
- Cheklovchi ma'lumot (qoldiq, limit, maksimal summa) **kontrastli** va
  cheklanayotgan maydonning yonidami? (`text-slate-400` — juda oqish; `slate-600`
  yoki qizil ishlating.)
- Input'da `max` / `min` bormi?
- Chegara buzilganda **yuborish tugmasi bloklanadimi**, yoki foydalanuvchi
  formani to'ldirib bo'lgach server xatosini oladimi?
- Server tomonda ham tekshiruv bormi (UI cheklovi xavfsizlik emas)?

### 4. Holat o'zgarishi ko'rinadimi
Checkbox/tanlov biror narsani o'zgartirsa, buni **ekranda ko'rish mumkinmi**?
- "ombordan ayirilmaydi" degan checkbox belgilanganda qoldiq ko'rsatkichi
  o'zgarmasa — foydalanuvchi ta'sirni tasdiqlay olmaydi.
- **Tuzatish:** blok rangi + har qatorda qisqa izoh.

### 5. Yopish / orqaga qaytish
- Modalda yopish tugmasi **uzun kontentda ham ko'rinadimi** (`fixed`, `absolute`
  emas)? Esc ishlaydimi? Fon bosilsa yopiladimi?
- Yopish sekin navigatsiyani kutmaydimi? (Modal darhol yo'qolsin, navigatsiya
  fonda ketsin — `profile-modal-shell.tsx` naqshi.)

### 6. Kutish holati
- Sekin ma'lumotli sahifa/modalda `loading.tsx` yoki skeleton bormi? Aks holda
  bosilgach ekranda hech nima o'zgarmaydi va ilova "qotgandek" ko'rinadi.
- Tugma bosilganda `disabled` + toast bormi? (Loyiha konvensiyasi: har amal
  natijasiga 2s toast — `useActionToast`.)

### 7. Bo'sh va xato holatlari
- Ro'yxat bo'sh bo'lsa `EmptyState` bilan **nima qilish kerakligi** aytiladimi?
- Xato matni foydalanuvchi tilida va **keyingi qadamni** aytadimi?

### 8. Fayl va tashqi havolalar
- Fayl (chek, hujjat) xom `target="_blank"` bilan ochilmasin — `openDocument()`
  modali ishlatiladi (`document-viewer.tsx`), kontekst (mijoz, summa, sana)
  bilan.

### 9. Mobil va qorong'i rejim
- `grid-cols-2` kabi qatorlar tor ekranda buzilmaydimi (`sm:` variantlari bormi)?
- Har bir rang uchun `dark:` varianti bormi?

### 10. Til va atamalar
- Matnlar o'zbekcha va loyiha atamalari bilan bir xilmi (mijoz, lid, usta,
  otkaz, qarzdor)? Aralash til yoki tarjima qilinmagan qism qolmaganmi?

## Hisobot namunasi

```
1. Manba vs "Allaqachon o'rnatilgan" ziddiyati
   Nima: checkbox belgilanganda select o'chiriladi, lekin "Sklad (ombor)" ko'rinib turadi.
   Nega yomon: forma bir vaqtda ikki xil narsa aytadi.
   Tuzatish: select o'rniga "Mijozda — hech qayerdan olinmaydi" holati.
```

## Eslatma

Vizual tekshiruv (brauzerda ochib ko'rish) lokal baza ishlayotganda mumkin.
Baza o'chiq bo'lsa buni ochiq ayting va kod darajasidagi xulosa bilan cheklaning —
"ko'rdim" deb aytmang.
