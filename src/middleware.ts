import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { canAccess, roleHome } from "@/lib/rbac";
import { buildCsp, generateNonce, NONCE_HEADER } from "@/lib/csp";
import { REQUEST_ID_HEADER } from "@/lib/request-id";

const PUBLIC_PATHS = ["/login", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // CSP nonce — har so'rovga yangi. Sarlavha orqali ham ILOVAGA (server
  // komponentlar `headers()` bilan o'qiydi), ham JAVOBGA yoziladi; Next.js
  // o'zining inline skriptlariga nonce'ni javob sarlavhasidagi CSP'dan oladi.
  const nonce = generateNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");

  // So'rov-ID — log/xatolarni bir so'rov bo'yicha bog'lash uchun. Yuqori oqimdan
  // (proxy) kelgan bo'lsa saqlanadi, bo'lmasa yangi yaratiladi.
  const requestId = req.headers.get(REQUEST_ID_HEADER) || crypto.randomUUID();

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set(NONCE_HEADER, nonce);
  reqHeaders.set("content-security-policy", csp);
  reqHeaders.set(REQUEST_ID_HEADER, requestId);

  /** Redirect/next javobiga CSP va so'rov-ID qo'shadi. */
  const withCsp = (res: NextResponse) => {
    res.headers.set("content-security-policy", csp);
    res.headers.set(REQUEST_ID_HEADER, requestId);
    return res;
  };
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await decodeSession(token);
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Avtorizatsiya yo'q — login'ga
  if (!session && !isPublic) {
    return withCsp(NextResponse.redirect(new URL("/login", req.url)));
  }

  // Kirgan foydalanuvchi login sahifasida — o'z asosiy sahifasiga
  if (session && pathname === "/login") {
    return withCsp(NextResponse.redirect(new URL(roleHome(session.role), req.url)));
  }

  // Rol bo'yicha sahifa ruxsati — ruxsat yo'q bo'lsa o'z asosiy sahifasiga
  if (session && !isPublic && !canAccess(session.role, pathname)) {
    return withCsp(NextResponse.redirect(new URL(roleHome(session.role), req.url)));
  }

  return withCsp(NextResponse.next({ request: { headers: reqHeaders } }));
}

export const config = {
  // Statik fayllar va Next ichki yo'llaridan tashqari HAMMASI.
  //
  // Ilgari bu yerda `.*\..*` bo'lagi turardi — u nomida NUQTA bo'lgan HAR
  // QANDAY yo'lni chetlab o'tardi (masalan `/mijozlar/abc.def` middleware'siz
  // ishlardi, ya'ni sessiya va rol tekshiruvisiz). Bugun buni
  // `(app)/layout.tsx` dagi requireSession qoplab turibdi, lekin faqat
  // middleware'ga tayangan yangi sahifa jimgina ochiq qolib ketishi mumkin
  // edi. Endi — statik fayl kengaytmalarining ANIQ ro'yxati.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|css|js|map|txt|xml|json|woff|woff2|ttf|otf|eot|mp4|webm)$).*)",
  ],
};
