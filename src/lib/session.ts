// Edge-safe (faqat jose) — middleware va server komponentlarda ishlatiladi.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "tp_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 kun

export type SessionPayload = {
  userId: string;
  name: string;
  username: string;
  role: string;
};

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET .env faylida belgilanmagan");
  }
  return new TextEncoder().encode(secret);
}

export async function encodeSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function decodeSession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"], // algoritm chalkashligi oldini olish
    });
    return {
      userId: payload.userId as string,
      name: payload.name as string,
      username: payload.username as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}
