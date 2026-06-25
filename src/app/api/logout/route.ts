import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

// Sessiya cookie'sini tozalab /login ga yo'naltiradi.
// requireSession faolsiz/yo'q foydalanuvchini shu yerga yuboradi (RSC render'da
// cookie o'zgartirib bo'lmaydi, route handler esa mumkin).
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
