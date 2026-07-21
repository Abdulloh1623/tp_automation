import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { canAccess, roleHome } from "@/lib/rbac";
import { buildCsp, generateNonce, NONCE_HEADER } from "@/lib/csp";

const PUBLIC_PATHS = ["/login", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // CSP nonce — har so'rovga yangi. Sarlavha orqali ham ILOVAGA (server
  // komponentlar `headers()` bilan o'qiydi), ham JAVOBGA yoziladi; Next.js
  // o'zining inline skriptlariga nonce'ni javob sarlavhasidagi CSP'dan oladi.
  const nonce = generateNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set(NONCE_HEADER, nonce);
  reqHeaders.set("content-security-policy", csp);

  /** Redirect/next javobiga CSP qo'shadi. */
  const withCsp = (res: NextResponse) => {
    res.headers.set("content-security-policy", csp);
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
  // statik fayllar va next ichki yo'llaridan tashqari hammasi
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
