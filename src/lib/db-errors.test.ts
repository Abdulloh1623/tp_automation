import { describe, it, expect } from "vitest";
import { isTransientDbError } from "./db-errors";

describe("isTransientDbError", () => {
  it("Prisma ulanish kodlari — o'tkinchi", () => {
    expect(isTransientDbError({ code: "P1017", message: "Server has closed the connection" })).toBe(true);
    expect(isTransientDbError({ code: "P1001" })).toBe(true);
    expect(isTransientDbError({ code: "P2024" })).toBe(true);
  });

  it("kod bo'lmasa ham xabar matni bo'yicha aniqlaydi", () => {
    expect(isTransientDbError(new Error("Server has closed the connection."))).toBe(true);
    expect(isTransientDbError(new Error("Can't reach database server at postgres:5432"))).toBe(true);
    expect(isTransientDbError(new Error("connection was terminated"))).toBe(true);
  });

  it("postgres halokatdan tiklanayotganda (kodsiz Prisma xatosi) — o'tkinchi", () => {
    // Prod'da kelgan haqiqiy xato (27/07/26 08:00, worker · distribute)
    const real = new Error(
      "\nInvalid `prisma.user.findMany()` invocation:\n\n\n" +
        "Error in connector: Error querying the database: FATAL: the database system is in recovery mode",
    );
    real.name = "PrismaClientUnknownRequestError";
    expect(isTransientDbError(real)).toBe(true);
  });

  it("serverning boshqa vaqtinchalik holatlari — o'tkinchi", () => {
    expect(isTransientDbError(new Error("FATAL: the database system is starting up"))).toBe(true);
    expect(isTransientDbError(new Error("FATAL: the database system is shutting down"))).toBe(true);
    expect(
      isTransientDbError(new Error("FATAL: terminating connection due to administrator command")),
    ).toBe(true);
    expect(
      isTransientDbError(
        new Error("FATAL: terminating connection due to crash of another server process"),
      ),
    ).toBe(true);
    expect(isTransientDbError(new Error("FATAL: sorry, too many clients already"))).toBe(true);
    expect(isTransientDbError(new Error("connect ECONNREFUSED 172.18.0.2:5432"))).toBe(true);
  });

  it("mantiqiy/boshqa xatolar — o'tkinchi EMAS", () => {
    expect(isTransientDbError({ code: "P2002", message: "Unique constraint failed" })).toBe(false);
    expect(isTransientDbError(new Error("Mijoz topilmadi"))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
  });
});
