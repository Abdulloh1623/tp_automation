import { describe, it, expect } from "vitest";
import { withDbRetry } from "./db-retry";

const transient = () => ({ code: "P1017", message: "Server has closed the connection" });

describe("withDbRetry", () => {
  it("birinchi urinishda muvaffaqiyat — qayta urinmaydi", async () => {
    let calls = 0;
    const r = await withDbRetry(async () => {
      calls++;
      return "ok";
    });
    expect(r).toBe("ok");
    expect(calls).toBe(1);
  });

  it("o'tkinchi xatodan keyin qayta uriladi va tuzatadi", async () => {
    let calls = 0;
    const r = await withDbRetry(
      async () => {
        calls++;
        if (calls === 1) throw transient();
        return "recovered";
      },
      1,
      0,
    );
    expect(r).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("o'tkinchi bo'lmagan xato — darhol uzatiladi, qayta urinmaydi", async () => {
    let calls = 0;
    await expect(
      withDbRetry(async () => {
        calls++;
        throw new Error("Mijoz topilmadi");
      }),
    ).rejects.toThrow("Mijoz topilmadi");
    expect(calls).toBe(1);
  });

  it("retry tugagach ham o'tkinchi xato qolsa — uzatiladi", async () => {
    let calls = 0;
    await expect(
      withDbRetry(
        async () => {
          calls++;
          throw transient();
        },
        1,
        0,
      ),
    ).rejects.toMatchObject({ code: "P1017" });
    expect(calls).toBe(2);
  });
});
