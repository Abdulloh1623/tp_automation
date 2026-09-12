// `(.)mijozlar/[id]` dinamik segmenti "yangi"ni ham mijoz ID sifatida ilib
// olib, `ClientProfile` uni topolmay `notFound()` chaqirar edi (soft
// navigatsiyada — Link/router.push orqali) — mijoz topilmasa 404 chiqardi.
// Bu aniq segment o'sha dinamik yo'ldan USTUN turadi va modalni yopiq holda
// qoldiradi, natijada asosiy slot haqiqiy "Yangi mijoz" sahifasini ko'rsatadi.
export default function ModalDefaultForNewClient() {
  return null;
}
