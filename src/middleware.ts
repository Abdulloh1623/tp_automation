import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { canAccess, roleHome } from "@/lib/rbac";

const PUBLIC_PATHS = ["/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await decodeSession(token);
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Avtorizatsiya yo'q — login'ga
  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Kirgan foydalanuvchi login sahifasida — o'z asosiy sahifasiga
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL(roleHome(session.role), req.url));
  }

  // Rol bo'yicha sahifa ruxsati — ruxsat yo'q bo'lsa o'z asosiy sahifasiga
  if (session && !isPublic && !canAccess(session.role, pathname)) {
    return NextResponse.redirect(new URL(roleHome(session.role), req.url));
  }

  return NextResponse.next();
}

export const config = {
  // statik fayllar va next ichki yo'llaridan tashqari hammasi
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
