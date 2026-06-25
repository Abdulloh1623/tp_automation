# TP Automation CRM — Rol bo'yicha foydalanuvchi qo'llanmalari

Restoran POS uskunalari (dastur + monoblok + printer + WiFi router) obuna biznesi uchun
mijozlar, to'lovlar, ombor va dala ishlarini boshqarish tizimi.

Har bir xodim **o'z roliga** mos qo'llanmani o'qiydi:

| Rol | Qo'llanma | Asosiy ishi |
|-----|-----------|-------------|
| 📞 **Texnik xodim (Operator)** | [01-OPERATOR.md](01-OPERATOR.md) | Kunlik qo'ng'iroqlar, to'lov qabul qilish, lidlar |
| 🔧 **Usta (dala texnigi)** | [02-USTA.md](02-USTA.md) | O'rnatish/xizmat va uskuna qaytarish (telefonda) |
| 👔 **Texnik bo'lim boshlig'i (Manager)** | [03-MANAGER.md](03-MANAGER.md) | Ombor, ustalar, eskalatsiya, hisobot, to'lovlar |
| 🔑 **Administrator** | [04-ADMIN.md](04-ADMIN.md) | Foydalanuvchilar, import, audit, backup, butun tizim |

> To'liq (bir faylda) eski qo'llanma: [../FOYDALANUVCHI-QOLLANMASI.md](../FOYDALANUVCHI-QOLLANMASI.md)

---

## Kirish ma'lumotlari

Loginlar **har xil**, parol **hammasiga bir xil**: `parol123`.

| Rol | Login | Parol |
|-----|-------|-------|
| Administrator | `admin` | `parol123` |
| Operator | `asadbek` | `parol123` |
| Operator | `suxrob` | `parol123` |
| Manager | `boshliq` | `parol123` |
| Usta | `bekzod` | `parol123` |

Manzil: **http://localhost:3100** · ⚠️ Umumiy parol — har bir xodim birinchi kirgandan
so'ng o'zinikini o'zgartirishi tavsiya etiladi (Foydalanuvchilar bo'limida admin orqali).

---

## Rollar nimani ko'radi (qisqacha)

| Bo'lim | Operator | Usta | Manager | Admin |
|--------|:---:|:---:|:---:|:---:|
| Boshqaruv paneli | | | | ✅ |
| Kunlik ish (lidlar) | ✅ | | ✅ | ✅ |
| Vazifalar | | ✅ | ✅ | ✅ |
| Mijozlar | ✅ | | ✅ | ✅ |
| To'ldirilmagan | ✅ | | ✅ | ✅ |
| Muammolar | ✅ | | ✅ | ✅ |
| Ombor | | | ✅ | ✅ |
| Ustalar | | | ✅ | ✅ |
| Eskalatsiya | | | ✅ | ✅ |
| To'lovlar | | | ✅ | ✅ |
| Hisobot | | | ✅ | ✅ |
| Foydalanuvchilar | | | | ✅ |
| Audit | | | | ✅ |
| Import | | | | ✅ |

---

## Umumiy elementlar (barcha rollar uchun)
- **Chap menyu** faqat sizning rolingizga ruxsat etilgan bo'limlarni ko'rsatadi.
- **Telefon raqamlari** ko'k — bosilsa qo'ng'iroq qilinadi (`+998 90 481 43 75`).
- **Qidiruv** ko'p jadvallarda yozayotganda avtomatik ishlaydi.
- **Toast** bildirishnomalar amal bajarilganda o'ng pastda chiqadi.
- **Telefon** ekranida jadvallar qulay **karta** ko'rinishiga o'tadi.
- Har bir muhim amal **audit jurnaliga** yoziladi.

*Oxirgi yangilanish: 2026-06.*
