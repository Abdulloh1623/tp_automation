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

  it("mantiqiy/boshqa xatolar — o'tkinchi EMAS", () => {
    expect(isTransientDbError({ code: "P2002", message: "Unique constraint failed" })).toBe(false);
    expect(isTransientDbError(new Error("Mijoz topilmadi"))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
  });
});
