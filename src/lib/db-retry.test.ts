import { describe, it, expect, vi } from "vitest";
import { withDbRetry, withDbJobRetry } from "./db-retry";

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

  it("kechikish factor bo'yicha o'sadi va onRetry xabar beradi", async () => {
    const delays: number[] = [];
    let calls = 0;
    const r = await withDbRetry(
      async () => {
        calls++;
        if (calls < 4) throw transient();
        return "ok";
      },
      5,
      1,
      { factor: 2, onRetry: (_attempt, delay) => delays.push(delay) },
    );
    expect(r).toBe("ok");
    expect(delays).toEqual([1, 2, 4]);
  });

  it("maxDelayMs kechikishni cheklaydi", async () => {
    const delays: number[] = [];
    let calls = 0;
    await withDbRetry(
      async () => {
        calls++;
        if (calls < 4) throw transient();
        return "ok";
      },
      5,
      1,
      { factor: 10, maxDelayMs: 5, onRetry: (_a, d) => delays.push(d) },
    );
    expect(delays).toEqual([1, 5, 5]);
  });
});

describe("withDbJobRetry", () => {
  it("baza tiklanish rejimidan chiqqach ish bajariladi", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const p = withDbJobRetry(async () => {
        calls++;
        if (calls < 3) throw new Error("FATAL: the database system is in recovery mode");
        return "taqsimlandi";
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(p).resolves.toBe("taqsimlandi");
      expect(calls).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
