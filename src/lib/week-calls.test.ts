import { describe, it, expect } from "vitest";
import { groupCallsByDay, WEEK_CALLS_DAYS, type WeekCall } from "./week-calls";

// "Hozir" — 03-avgust 2026, 10:00 (UTC+5) = 05:00 UTC
const NOW = new Date("2026-08-03T05:00:00.000Z");

function call(over: Partial<WeekCall> & { calledAt: Date }): WeekCall {
  return {
    clientId: over.clientId ?? "c1",
    restaurantName: over.restaurantName ?? "Restoran A",
    fullName: over.fullName ?? "Ali Aliyev",
    phone: over.phone ?? "998901112233",
    result: over.result ?? "TALKED",
    note: over.note ?? null,
    calledAt: over.calledAt,
  };
}

describe("groupCallsByDay", () => {
  it("har doim 7 kun qaytaradi — bo'sh kun ham", () => {
    const days = groupCallsByDay([], NOW);

    expect(days).toHaveLength(WEEK_CALLS_DAYS);
    expect(days[0].isToday).toBe(true);
    expect(days[0].key).toBe("2026-08-03");
    expect(days[6].key, "eng eski kun — 6 kun oldin").toBe("2026-07-28");
    expect(days.every((d) => d.leads === 0)).toBe(true);
  });

  it("qo'ng'iroqni UTC+5 kuniga joylaydi (UTC sanasiga EMAS)", () => {
    // 03-avgust 01:30 (Toshkent) = 02-avgust 20:30 UTC — UTC bo'yicha guruhlansa
    // oldingi kunga tushib ketardi.
    const days = groupCallsByDay([call({ calledAt: new Date("2026-08-02T20:30:00.000Z") })], NOW);

    expect(days[0].key).toBe("2026-08-03");
    expect(days[0].leads).toBe(1);
    expect(days[0].items[0].time).toBe("01:30");
    expect(days[1].leads, "oldingi kun bo'sh qoladi").toBe(0);
  });

  it("bir kunda bir mijoz BIR MARTA — oxirgi natija va qo'ng'iroqlar soni bilan", () => {
    const days = groupCallsByDay(
      [
        call({ calledAt: new Date("2026-08-03T04:00:00.000Z"), result: "NO_ANSWER" }),
        call({ calledAt: new Date("2026-08-03T04:40:00.000Z"), result: "WILL_PAY" }),
      ],
      NOW,
    );

    expect(days[0].leads).toBe(1);
    const item = days[0].items[0];
    expect(item.calls).toBe(2);
    expect(item.result, "kundagi OXIRGI natija").toBe("WILL_PAY");
    expect(item.resultLabel).toBe("To'lov qiladi");
    expect(item.talked).toBe(true);
  });

  it("kun sarlavhasida gaplashilganlar alohida sanaladi", () => {
    const days = groupCallsByDay(
      [
        call({ clientId: "a", calledAt: new Date("2026-08-03T04:00:00.000Z"), result: "WILL_PAY" }),
        call({ clientId: "b", calledAt: new Date("2026-08-03T04:10:00.000Z"), result: "NO_ANSWER" }),
        call({ clientId: "d", calledAt: new Date("2026-08-03T04:20:00.000Z"), result: "PHONE_OFF" }),
      ],
      NOW,
    );

    expect(days[0].leads).toBe(3);
    expect(days[0].talked, "faqat haqiqiy gaplashuv").toBe(1);
  });

  it("kun ichida bir marta gaplashilgan bo'lsa — gaplashilgan hisoblanadi", () => {
    // Oxirgi urinish ko'tarilmagan, lekin ertalab gaplashilgan.
    const days = groupCallsByDay(
      [
        call({ calledAt: new Date("2026-08-03T03:00:00.000Z"), result: "WILL_PAY" }),
        call({ calledAt: new Date("2026-08-03T04:00:00.000Z"), result: "NO_ANSWER" }),
      ],
      NOW,
    );

    expect(days[0].items[0].result).toBe("NO_ANSWER");
    expect(days[0].items[0].talked).toBe(true);
    expect(days[0].talked).toBe(1);
  });

  it("oynadan tashqaridagi eski qo'ng'iroq tushmaydi", () => {
    const days = groupCallsByDay(
      [call({ calledAt: new Date("2026-07-27T06:00:00.000Z") })], // 7 kundan oldin
      NOW,
    );

    expect(days.every((d) => d.leads === 0)).toBe(true);
  });

  it("kirish tartibi ahamiyatsiz — natija bir xil", () => {
    const calls = [
      call({ calledAt: new Date("2026-08-01T06:00:00.000Z"), result: "NO_ANSWER" }),
      call({ calledAt: new Date("2026-08-01T09:00:00.000Z"), result: "PAID" }),
    ];
    const asc = groupCallsByDay(calls, NOW);
    const desc = groupCallsByDay([...calls].reverse(), NOW);

    expect(asc[2].items[0].result).toBe("PAID");
    expect(desc[2].items[0].result).toBe("PAID");
    expect(asc[2].items[0].calls).toBe(2);
  });
});
