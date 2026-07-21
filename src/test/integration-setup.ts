// Integratsion testlar uchun muhit.
//
// Server action'lar Next.js ning so'rov kontekstiga tayanadi (`cookies()`,
// `revalidatePath`, `redirect`). Test jarayonida bunday kontekst yo'q — shu
// bois ularni shu yerda almashtiramiz.
//
// MUHIM: `@/lib/auth` MOCK QILINMAYDI. Sessiya haqiqiy JWT bilan quriladi va
// `guardRole` bazadan rolni haqiqatan o'qiydi — shunda testlar ruxsat
// tekshiruvlarini ham qoplaydi (auditda aynan shu qatlamda muammolar topilgan).

import { vi, beforeAll, afterAll } from "vitest";

// --- Cookie do'koni (test jarayonida yashaydi) --------------------------------
const cookieJar = new Map<string, string>();

export function setTestCookie(name: string, value: string) {
  cookieJar.set(name, value);
}
export function clearTestCookies() {
  cookieJar.clear();
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (nameOrObj: string | { name: string; value: string }, value?: string) => {
      if (typeof nameOrObj === "string") cookieJar.set(nameOrObj, value ?? "");
      else cookieJar.set(nameOrObj.name, nameOrObj.value);
    },
    delete: (name: string) => cookieJar.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-proto": "http" }),
}));

// --- Next.js kesh/navigatsiya -------------------------------------------------
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

/** `redirect()` chaqirilganini testda tekshirish uchun maxsus xato. */
export class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`REDIRECT:${url}`);
    this.name = "RedirectError";
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

// --- Baza ---------------------------------------------------------------------

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "Integratsion testlar uchun DATABASE_URL kerak (test bazasiga ko'rsatsin!). " +
        "npm run test:integration ni ishlating.",
    );
  }
  // Ehtiyot chorasi: ishlab chiqarish yoki asosiy dev bazasini tozalab
  // yubormaslik uchun baza nomida "test" bo'lishi SHART.
  const dbName = process.env.DATABASE_URL.split("/").pop()?.split("?")[0] ?? "";
  if (!dbName.includes("test")) {
    throw new Error(
      `XAVFSIZLIK: integratsion testlar baza nomida "test" bo'lishini talab qiladi. ` +
        `Hozirgi baza: "${dbName}". Testlar bazani TOZALAYDI — noto'g'ri bazaga ulanish ma'lumot yo'qotadi.`,
    );
  }
});

afterAll(async () => {
  const { db } = await import("@/lib/db");
  await db.$disconnect();
});
