import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionPayload } from "./session";

// Prisma'ni mock qilamiz — DB ulanishisiz faqat rol-mantig'ini tekshiramiz.
const { clientFindUnique, clientFindFirst, userFindFirst } = vi.hoisted(() => ({
  clientFindUnique: vi.fn(),
  clientFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    client: { findUnique: clientFindUnique, findFirst: clientFindFirst },
    user: { findFirst: userFindFirst },
  },
}));

import { canMutateClient, resolveAssignee } from "./access";

const sess = (role: string, userId = "u1"): SessionPayload => ({
  userId,
  name: "Test",
  username: "test",
  role,
  version: 0,
});

beforeEach(() => vi.clearAllMocks());

describe("canMutateClient — egalik / IDOR himoyasi", () => {
  it("clientId bo'sh → false (DB so'ralmaydi)", async () => {
    expect(await canMutateClient(sess("ADMIN"), "")).toBe(false);
    expect(clientFindUnique).not.toHaveBeenCalled();
  });

  it("INSTALLER → har doim false (DB so'ralmaydi)", async () => {
    expect(await canMutateClient(sess("INSTALLER"), "c1")).toBe(false);
    expect(clientFindUnique).not.toHaveBeenCalled();
    expect(clientFindFirst).not.toHaveBeenCalled();
  });

  it("ADMIN: mijoz mavjud → true (faqat id bo'yicha)", async () => {
    clientFindUnique.mockResolvedValue({ id: "c1" });
    expect(await canMutateClient(sess("ADMIN"), "c1")).toBe(true);
    expect(clientFindUnique).toHaveBeenCalledWith({ where: { id: "c1" }, select: { id: true } });
  });

  it("MANAGER: mijoz mavjud emas → false", async () => {
    clientFindUnique.mockResolvedValue(null);
    expect(await canMutateClient(sess("MANAGER"), "c1")).toBe(false);
  });

  it("OPERATOR: istalgan mavjud mijozni o'zgartira oladi (egalik filtri YO'Q)", async () => {
    clientFindUnique.mockResolvedValue({ id: "c1" });
    expect(await canMutateClient(sess("OPERATOR", "op9"), "c1")).toBe(true);
    // Endi biriktiruv (assignedToId) bo'yicha filtrlanmaydi — faqat id bo'yicha
    expect(clientFindUnique).toHaveBeenCalledWith({ where: { id: "c1" }, select: { id: true } });
    expect(clientFindFirst).not.toHaveBeenCalled();
  });

  it("OPERATOR: mijoz mavjud emas → false", async () => {
    clientFindUnique.mockResolvedValue(null);
    expect(await canMutateClient(sess("OPERATOR", "op9"), "c1")).toBe(false);
  });
});

describe("resolveAssignee — biriktirishni xavfsiz aniqlash", () => {
  it("OPERATOR: doimo o'zi (boshqasiga bera olmaydi, DB so'ralmaydi)", async () => {
    expect(await resolveAssignee(sess("OPERATOR", "op9"), "boshqaOdam")).toBe("op9");
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("ADMIN: raw bo'sh → null", async () => {
    expect(await resolveAssignee(sess("ADMIN"), null)).toBeNull();
    expect(await resolveAssignee(sess("ADMIN"), undefined)).toBeNull();
  });

  it("ADMIN: mos rolli + faol foydalanuvchi → o'sha id", async () => {
    userFindFirst.mockResolvedValue({ id: "u5" });
    expect(await resolveAssignee(sess("ADMIN"), "u5")).toBe("u5");
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: "u5", role: { in: ["OPERATOR", "ADMIN", "MANAGER"] }, isActive: true },
      select: { id: true },
    });
  });

  it("ADMIN: mavjud emas / faol emas / noto'g'ri rol → null", async () => {
    userFindFirst.mockResolvedValue(null);
    expect(await resolveAssignee(sess("MANAGER"), "ghost")).toBeNull();
  });
});
