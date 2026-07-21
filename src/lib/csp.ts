// Content-Security-Policy — so'rov bo'yicha nonce bilan.
//
// NEGA nonce: ilgari `script-src` da `'unsafe-inline'` turardi, ya'ni CSP o'z
// asosiy vazifasini — XSS ni to'sishni — bajarmasdi. Ilova operator kiritgan
// erkin matnni (mijoz nomi, izoh, taklif) ko'p sahifada ko'rsatadi, shu bois
// inline skriptni bloklash eng qimmatli himoya.
//
// `'strict-dynamic'`: Next.js inline bootstrap skript orqali o'z chunk'larini
// yuklaydi. strict-dynamic nonce bilan ishonilgan skriptga o'zi yuklagan
// skriptlarni ham ruxsat beradi — busiz har bir chunk uchun alohida ruxsat
// kerak bo'lardi.

/** Har bir so'rov uchun tasodifiy nonce (Edge runtime'da ham ishlaydi). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // btoa Edge runtime'da mavjud; Buffer esa yo'q.
  return btoa(String.fromCharCode(...bytes));
}

/**
 * CSP satrini yig'adi.
 * Dev'da HMR uchun `'unsafe-eval'` qo'shiladi (faqat NODE_ENV !== production).
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Dev: Next HMR eval ishlatadi. Prodda YO'Q.
    ...(isDev ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Tailwind va inline style atributlari uchun — script'ga nisbatan xavfi past.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Nonce shu sarlavha orqali server komponentlarga uzatiladi. */
export const NONCE_HEADER = "x-nonce";
