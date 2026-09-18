import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma, audit va sozlamalarni mock qilamiz — DB'siz orkestratsiya mantig'i.
const {
  userFindMany,
  clientFindMany,
  clientUpdateMany,
  callLogFindMany,
  dutyDayFindMany,
  logAudit,
  getActiveLeadProfile,
  currentShift,
  grantFindMany,
  getRecallSettings,
  getTodayDayAutoLimits,
  setTodayDayAutoLimits,
} = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  clientFindMany: vi.fn(),
  clientUpdateMany: vi.fn(),
  callLogFindMany: vi.fn(),
  dutyDayFindMany: vi.fn(),
  logAudit: vi.fn(),
  getActiveLeadProfile: vi.fn(),
  currentShift: vi.fn(),
  grantFindMany: vi.fn(),
  getRecallSettings: vi.fn(),
  getTodayDayAutoLimits: vi.fn(),
  setTodayDayAutoLimits: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findMany: userFindMany },
    client: { findMany: clientFindMany, updateMany: clientUpdateMany },
    callLog: { findMany: callLogFindMany },
    dailyLeadGrant: { findMany: grantFindMany },
    dutyDay: { findMany: dutyDayFindMany },
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit }));
vi.mock("@/lib/settings", () => ({
  FALLBACK_AUTO_LIMIT_KEY: "__fallback__",
  getActiveLeadProfile,
  getRecallSettings,
  getTodayDayAutoLimits,
  setTodayDayAutoLimits,
}));
vi.mock("@/lib/shift", () => ({ currentShift }));

import { distributeLeadsCore } from "./leads-distribution";

// updateMany har doim ta'sirlangan qatorlar sonini qaytaradi
const countByIds = ({ where }: { where: { id: { in: string[] } } }) =>
  Promise.resolve({ count: where.id.in.length });

const DAY = 86400000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const inDays = (n: number) => new Date(Date.now() + n * DAY);

/** To'liq maydonli lid — segmentlash uchun hamma ustun kerak. */
function lead(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    assignedToId: null,
    pendingStage: null,
    stage: "NO_ANSWER",
    createdAt: daysAgo(200),
    nextPaymentDate: inDays(20),
    nextContactDate: null,
    lastContactedAt: daysAgo(1),
    missedCallCount: 0,
    monthlyAmount: 30,
    currency: "USD",
    region: null,
    ...over,
  };
}

/** Biriktirilgan (assignedToId != null) chaqiruvlardagi barcha id'lar. */
function assignedIds() {
  return clientUpdateMany.mock.calls
    .filter((c) => c[0].data.assignedToId !== null)
    .flatMap((c) => c[0].where.id.in as string[]);
}

/**
 * Hovuzni o'rnatadi. Taqsimot ikki xil so'rov yuboradi: (1) bugungi hovuz,
 * (2) "oldinga tortish" uchun muddati kelmaganlar (`nextContactDate.gt`).
 * Mock `where` ni hisobga olmasa, ikkinchi so'rov birinchisini takrorlab
 * dublikat yasardi — shuning uchun ularni ajratamiz.
 */
function setPool(rows: unknown[], upcoming: unknown[] = []) {
  clientFindMany.mockImplementation(
    ({ where, take }: { where?: Record<string, unknown>; take?: number }) => {
      const isUpcoming = !!(where?.nextContactDate as { gt?: Date } | undefined)?.gt;
      if (!isUpcoming) return Promise.resolve(rows);
      // Haqiqiy so'rovdagi `take` cheklovini taqlid qilamiz — oldinga tortish
      // aynan yetishmagan songacha olishi kerak.
      return Promise.resolve(take != null ? upcoming.slice(0, take) : upcoming);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  callLogFindMany.mockResolvedValue([]);
  grantFindMany.mockResolvedValue([]);
  // Standart: bugungi jadval bo'sh emas (placeholder) — `userFindMany` argumentdan
  // qat'i nazar mock qilinadi, shuning uchun aynan qaysi id emas, faqat "bo'sh
  // emasligi" muhim (bo'sh bo'lsa distributeLeadsCore darhol xato bilan qaytadi).
  // Smena/jadval mantig'ini sinaydigan testlar buni o'zi qayta belgilaydi.
  dutyDayFindMany.mockResolvedValue([{ userId: "op1", shift: "DAY" }]);
  currentShift.mockReturnValue("DAY");
  // Standart siyosat: oldinga tortish o'chirilgan (min 0) — testlar aynan
  // berilgan hovuz ustida ishlasin.
  getRecallSettings.mockResolvedValue({
    rules: {},
    policy: {
      minPerOperator: 0,
      maxPerOperator: 50,
      debtorCooldownDays: 3,
      escalationThreshold: 3,
    },
  });
  getActiveLeadProfile.mockResolvedValue({
    selection: { kind: "preset", id: "BALANCED" },
    todayOnly: false,
    defaultSelection: { kind: "preset", id: "BALANCED" },
  });
  clientUpdateMany.mockImplementation(countByIds);
  // Standart: bugungi DAY kvotasi hali saqlanmagan (NIGHT testlari eski
  // mustaqil formulaga tushadi, agar aynan test o'zi boshqacha belgilamasa).
  getTodayDayAutoLimits.mockResolvedValue(null);
  setTodayDayAutoLimits.mockResolvedValue(undefined);
});

describe("distributeLeadsCore", () => {
  it("faol operator yo'q → xato, pool ham so'ralmaydi", async () => {
    userFindMany.mockResolvedValue([]);
    const r = await distributeLeadsCore();
    expect(r).toEqual({ assigned: 0, operators: 0, error: "Faol operator yo'q" });
    expect(clientFindMany).not.toHaveBeenCalled();
    expect(clientUpdateMany).not.toHaveBeenCalled();
  });

  it("barcha lidlarni operatorlarga ulashadi (yo'qotishsiz)", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 50 }, { id: "op2", dailyLimit: 50 }]);
    setPool(Array.from({ length: 5 }, (_, i) => lead(`c${i}`)));

    const r = await distributeLeadsCore();
    expect(r.operators).toBe(2);
    expect(r.assigned).toBe(5);
    expect(assignedIds().sort()).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  it("sig'imdan ortgani ertangi kunga qoldiriladi (assignedToId=null)", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 50 }]); // 1 operator × 50 = sig'im 50
    setPool(Array.from({ length: 53 }, (_, i) => lead(`c${i}`)));

    const r = await distributeLeadsCore();
    expect(r.assigned).toBe(50);

    const overflowCall = clientUpdateMany.mock.calls.find((c) => c[0].data.assignedToId === null);
    expect(overflowCall).toBeTruthy();
    expect(overflowCall![0].where.id.in.length).toBe(3); // 53 - 50
  });

  it("hech bir operator kunlik limitdan (50) oshmaydi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 50 }, { id: "op2", dailyLimit: 50 }]);
    setPool(Array.from({ length: 130 }, (_, i) => lead(`c${i}`)));

    await distributeLeadsCore();
    for (const call of clientUpdateMany.mock.calls) {
      if (call[0].data.assignedToId !== null) {
        expect(call[0].where.id.in.length).toBeLessThanOrEqual(50);
      }
    }
  });

  it("eski qarzdorlar (majburiy pol) fokusdan qat'i nazar taqsimlanadi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 50 }]);
    // 60 ta yangi mijoz + 3 ta 90 kunlik qarzdor; sig'im 50 — pol bo'lmasa
    // qarzdorlar tushib qolishi mumkin edi.
    const pool = [
      ...Array.from({ length: 60 }, (_, i) =>
        lead(`new${i}`, { stage: "NEW", createdAt: daysAgo(2) }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        lead(`debt${i}`, { nextPaymentDate: daysAgo(90) }),
      ),
    ];
    setPool(pool);
    // Fokus "yangi mijozlar" — qarzdorlarni ataylab pastga suradi
    getActiveLeadProfile.mockResolvedValue({
      selection: { kind: "preset", id: "NEW_CLIENTS" },
      todayOnly: true,
      defaultSelection: { kind: "preset", id: "BALANCED" },
    });

    const r = await distributeLeadsCore();
    expect(r.floor).toBe(3);
    const ids = assignedIds();
    expect(ids).toContain("debt0");
    expect(ids).toContain("debt1");
    expect(ids).toContain("debt2");
  });

  it("bugunga va'da berilgan lid majburiy polga kiradi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 50 }]);
    setPool([
      lead("promise", { nextContactDate: new Date() }),
      lead("boshqa"),
    ]);
    const r = await distributeLeadsCore();
    expect(r.floor).toBe(1);
    expect(assignedIds()).toContain("promise");
  });

  it("fokus profili ulushni belgilaydi (to'lov vs yangi mijozlar)", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 50 }]); // sig'im 50
    const pool = [
      ...Array.from({ length: 100 }, (_, i) =>
        lead(`debt${i}`, { nextPaymentDate: daysAgo(10) }),
      ),
      ...Array.from({ length: 100 }, (_, i) =>
        lead(`new${i}`, { stage: "NEW", createdAt: daysAgo(2) }),
      ),
    ];
    setPool(pool);

    getActiveLeadProfile.mockResolvedValue({
      selection: { kind: "preset", id: "PAYMENT" },
      todayOnly: false,
      defaultSelection: { kind: "preset", id: "BALANCED" },
    });
    await distributeLeadsCore();
    const payFocus = assignedIds();
    expect(payFocus.length).toBe(50);
    expect(payFocus.filter((id) => id.startsWith("debt")).length).toBeGreaterThanOrEqual(40);

    vi.clearAllMocks();
    clientUpdateMany.mockImplementation(countByIds);
    callLogFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 50 }]);
    setPool(pool);
    getActiveLeadProfile.mockResolvedValue({
      selection: { kind: "preset", id: "NEW_CLIENTS" },
      todayOnly: false,
      defaultSelection: { kind: "preset", id: "BALANCED" },
    });
    await distributeLeadsCore();
    const newFocus = assignedIds();
    expect(newFocus.length).toBe(50);
    expect(newFocus.filter((id) => id.startsWith("new")).length).toBeGreaterThanOrEqual(40);
  });

  it("hech bir segment butunlay tushib qolmaydi (fokus = filtr emas)", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 50 }]);
    setPool([
      ...Array.from({ length: 100 }, (_, i) =>
        lead(`debt${i}`, { nextPaymentDate: daysAgo(10) }),
      ),
      ...Array.from({ length: 100 }, (_, i) =>
        lead(`new${i}`, { stage: "NEW", createdAt: daysAgo(2) }),
      ),
    ]);
    getActiveLeadProfile.mockResolvedValue({
      selection: { kind: "preset", id: "PAYMENT" },
      todayOnly: false,
      defaultSelection: { kind: "preset", id: "BALANCED" },
    });

    await distributeLeadsCore();
    // "To'lov yig'ish" fokusida ham yangi mijozlarga joy qoladi
    expect(assignedIds().filter((id) => id.startsWith("new")).length).toBeGreaterThan(0);
  });

  it("bugun ishlangan lid egasida qoladi va uning kvotasini band qiladi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 50 }]);
    setPool([
      lead("ishlangan", { assignedToId: "op1", pendingStage: "LATER" }),
      ...Array.from({ length: 60 }, (_, i) => lead(`c${i}`)),
    ]);

    const r = await distributeLeadsCore();
    expect(r.kept).toBe(1);
    // 50 - 1 (band) = 49 ta yangi biriktirish
    expect(r.assigned).toBe(49);
    const all = clientUpdateMany.mock.calls.flatMap((c) => c[0].where.id.in as string[]);
    expect(all).not.toContain("ishlangan"); // umuman tegilmaydi
  });

  it("bugun qo'ng'iroq qilingan lid ham egasida qoladi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 50 }]);
    callLogFindMany.mockResolvedValue([{ clientId: "tegilgan" }]);
    setPool([
      lead("tegilgan", { assignedToId: "op1" }),
      lead("c1"),
    ]);

    const r = await distributeLeadsCore();
    expect(r.kept).toBe(1);
    const all = clientUpdateMany.mock.calls.flatMap((c) => c[0].where.id.in as string[]);
    expect(all).not.toContain("tegilgan");
  });

  // --- Kunlik jadval (DutyDay) bo'yicha taqsimot ---

  it("faqat bugungi jadvalda o'sha smenaga tayinlanganlarga taqsimlanadi", async () => {
    dutyDayFindMany.mockResolvedValue([
      { userId: "night1", shift: "NIGHT" },
      { userId: "day1", shift: "DAY" },
    ]);
    userFindMany.mockResolvedValue([{ id: "night1", dailyLimit: 50 }]);
    setPool([lead("c0")]);

    const r = await distributeLeadsCore("NIGHT");
    expect(userFindMany.mock.calls[0][0].where).toMatchObject({
      role: "OPERATOR",
      isActive: true,
      id: { in: ["night1"] },
    });
    expect(r.operators).toBe(1);
    expect(assignedIds()).toEqual(["c0"]);
  });

  it("smenaga bugun hech kim tayinlanmagan va zaxira brigadadan ham hech kim topilmasa — xato", async () => {
    dutyDayFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([]); // zaxira ismlariga mos faol operator yo'q
    const r = await distributeLeadsCore("NIGHT");
    expect(r.error).toContain("Kechki");
    expect(clientUpdateMany).not.toHaveBeenCalled();
  });

  it("smena jadvalda bo'sh bo'lsa — zaxira brigada (ism bo'yicha) avtomatik ishlatiladi", async () => {
    dutyDayFindMany.mockResolvedValue([]);
    userFindMany.mockImplementation(({ where }: { where?: { OR?: unknown; id?: { in: string[] } } }) => {
      // Birinchi chaqiruv — zaxira brigada qidiruvi (OR: name startsWith)
      if (where?.OR) return Promise.resolve([{ id: "mehroj-id", name: "Mehroj Aliyev" }]);
      // Ikkinchi chaqiruv — topilgan zaxira operatorining o'zi (rosterIds bo'yicha)
      return Promise.resolve([{ id: "mehroj-id", dailyLimit: 50 }]);
    });
    setPool([lead("c0")]);

    const r = await distributeLeadsCore("NIGHT");
    expect(r.usedFallbackRoster).toBe(true);
    expect(r.operators).toBe(1);
    expect(assignedIds()).toEqual(["c0"]);
  });

  it("jadvalga tayinlangan lekin nofaol operator — 'faol operator yo'q' xatosi", async () => {
    dutyDayFindMany.mockResolvedValue([{ userId: "night1", shift: "NIGHT" }]);
    userFindMany.mockResolvedValue([]); // isActive filtri chiqarib tashladi
    const r = await distributeLeadsCore("NIGHT");
    expect(r.error).toBe("Kechki (18:00–09:00) smenasida faol operator yo'q");
    expect(clientUpdateMany).not.toHaveBeenCalled();
  });

  it("boshqa smena hali ishlayotgan bo'lsa — uning lidiga tegilmaydi", async () => {
    currentShift.mockReturnValue("NIGHT"); // kechki smena hozir ishlayapti
    dutyDayFindMany.mockResolvedValue([
      { userId: "day1", shift: "DAY" },
      { userId: "night1", shift: "NIGHT" },
    ]);
    userFindMany.mockResolvedValue([{ id: "day1", dailyLimit: 50 }]);
    setPool([
      lead("kechkida", { assignedToId: "night1" }),
      lead("bo'sh"),
    ]);

    const r = await distributeLeadsCore("DAY");
    expect(r.released).toBe(0);
    const all = clientUpdateMany.mock.calls.flatMap((c) => c[0].where.id.in as string[]);
    expect(all).not.toContain("kechkida");
    expect(assignedIds()).toContain("bo'sh");
  });

  it("tugagan smenaning ishlanmagan lidi joriy smenaga o'tadi", async () => {
    currentShift.mockReturnValue("NIGHT"); // kunduzgi smena tugagan
    dutyDayFindMany.mockResolvedValue([
      { userId: "day1", shift: "DAY" },
      { userId: "night1", shift: "NIGHT" },
    ]);
    userFindMany.mockResolvedValue([{ id: "night1", dailyLimit: 50 }]);
    setPool([lead("ulgurmagan", { assignedToId: "day1" })]);

    const r = await distributeLeadsCore("NIGHT");
    expect(r.released).toBe(1);
    expect(assignedIds()).toContain("ulgurmagan");
  });

  it("tugagan smenada ISHLANGAN lid egasida qoladi (bo'shatilmaydi)", async () => {
    currentShift.mockReturnValue("NIGHT");
    callLogFindMany.mockResolvedValue([{ clientId: "ishlangan" }]);
    dutyDayFindMany.mockResolvedValue([
      { userId: "day1", shift: "DAY" },
      { userId: "night1", shift: "NIGHT" },
    ]);
    userFindMany.mockResolvedValue([{ id: "night1", dailyLimit: 50 }]);
    setPool([lead("ishlangan", { assignedToId: "day1" })]);

    const r = await distributeLeadsCore("NIGHT");
    expect(r.released).toBe(0);
    const all = clientUpdateMany.mock.calls.flatMap((c) => c[0].where.id.in as string[]);
    expect(all).not.toContain("ishlangan");
  });

  it("smenasiz chaqiruv bugungi jadvaldagi ikkala smenani ham qamraydi", async () => {
    dutyDayFindMany.mockResolvedValue([
      { userId: "op1", shift: "DAY" },
      { userId: "op2", shift: "NIGHT" },
    ]);
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 50 }]);
    setPool([lead("c0", { assignedToId: "boshqa" })]);

    const r = await distributeLeadsCore();
    expect(r.shift).toBeUndefined();
    expect(userFindMany.mock.calls[0][0].where.id.in.sort()).toEqual(["op1", "op2"]);
    // Faqat bitta `user.findMany` so'rovi — smena uchun alohida so'rov yo'q.
    expect(userFindMany).toHaveBeenCalledTimes(1);
    expect(assignedIds()).toEqual(["c0"]);
  });

  it("bugungi jadval umuman belgilanmagan — xato, hech narsa so'ralmaydi", async () => {
    dutyDayFindMany.mockResolvedValue([]);
    const r = await distributeLeadsCore();
    expect(r.error).toContain("jadvali hali belgilanmagan");
    expect(userFindMany).not.toHaveBeenCalled();
    expect(clientFindMany).not.toHaveBeenCalled();
  });

  // --- Kunlik kvota: har operatorning o'ziniki + bir kunlik grant ---

  it("har operator O'Z kvotasicha oladi (global limit emas)", async () => {
    userFindMany.mockResolvedValue([
      { id: "kam", dailyLimit: 5 },
      { id: "kop", dailyLimit: 30 },
    ]);
    setPool(Array.from({ length: 100 }, (_, i) => lead(`c${i}`)));

    const r = await distributeLeadsCore();
    expect(r.capacity).toBe(35);
    expect(r.assigned).toBe(35);

    const byOp = new Map<string, number>();
    for (const call of clientUpdateMany.mock.calls) {
      const op = call[0].data.assignedToId;
      if (op) byOp.set(op, (byOp.get(op) ?? 0) + call[0].where.id.in.length);
    }
    expect(byOp.get("kam")).toBe(5);
    expect(byOp.get("kop")).toBe(30);
  });

  it("bot bergan bir kunlik qo'shimcha lid kvotani oshiradi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 10 }]);
    grantFindMany.mockResolvedValue([{ userId: "op1", extraCount: 7 }]);
    setPool(Array.from({ length: 50 }, (_, i) => lead(`c${i}`)));

    const r = await distributeLeadsCore();
    expect(r.granted).toBe(7);
    expect(r.capacity).toBe(17); // 10 + 7
    expect(r.assigned).toBe(17);
  });

  it("grant faqat BUGUNGI kunga va shu operatorlarga so'raladi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 10 }]);
    setPool([lead("c0")]);
    await distributeLeadsCore();
    const where = grantFindMany.mock.calls[0][0].where;
    expect(where.userId).toEqual({ in: ["op1"] });
    expect(where.date).toBeInstanceOf(Date);
  });

  it("bugun ishlangan lidlar kvotani band qiladi (grant bilan birga)", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 10 }]);
    grantFindMany.mockResolvedValue([{ userId: "op1", extraCount: 5 }]);
    callLogFindMany.mockResolvedValue([{ clientId: "ishlangan" }]);
    setPool([
      lead("ishlangan", { assignedToId: "op1" }),
      ...Array.from({ length: 50 }, (_, i) => lead(`c${i}`)),
    ]);

    const r = await distributeLeadsCore();
    expect(r.kept).toBe(1);
    expect(r.capacity).toBe(14); // 10 + 5 - 1
    expect(r.assigned).toBe(14);
  });

  it("kvotasi 0 bo'lgan operator lid olmaydi", async () => {
    userFindMany.mockResolvedValue([
      { id: "nol", dailyLimit: 0 },
      { id: "op1", dailyLimit: 3 },
    ]);
    setPool(Array.from({ length: 10 }, (_, i) => lead(`c${i}`)));

    const r = await distributeLeadsCore();
    expect(r.assigned).toBe(3);
    const toNol = clientUpdateMany.mock.calls.filter((c) => c[0].data.assignedToId === "nol");
    expect(toNol).toHaveLength(0);
  });

  // --- Avtomatik kvota (dailyLimit = null) ---

  /** Siyosatni almashtirish uchun qisqa yordamchi. */
  function policy(over: Record<string, number | boolean> = {}) {
    getRecallSettings.mockResolvedValue({
      rules: {},
      policy: {
        minPerOperator: 0,
        maxPerOperator: 50,
        debtorCooldownDays: 3,
        escalationThreshold: 3,
        ...over,
      },
    });
  }

  it("kvota null bo'lsa — ro'yxat operatorlarga teng bo'linadi", async () => {
    policy({ minPerOperator: 0, maxPerOperator: 100 });
    userFindMany.mockResolvedValue([
      { id: "op1", dailyLimit: null },
      { id: "op2", dailyLimit: null },
    ]);
    setPool(Array.from({ length: 30 }, (_, i) => lead(`c${i}`)));

    const r = await distributeLeadsCore();
    expect(r.autoLimit).toBe(15); // 30 / 2
    expect(r.assigned).toBe(30);
  });

  it("avtomatik kvota eng ko'p chegarasidan oshmaydi", async () => {
    policy({ minPerOperator: 0, maxPerOperator: 12 });
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: null }]);
    setPool(Array.from({ length: 40 }, (_, i) => lead(`c${i}`)));

    const r = await distributeLeadsCore();
    expect(r.autoLimit).toBe(12);
    expect(r.assigned).toBe(12);
  });

  it("ro'yxat kam bo'lsa — muddati yaqinlar oldinga tortiladi", async () => {
    policy({ minPerOperator: 10, maxPerOperator: 50 });
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: null }]);
    setPool(
      [lead("bugun")],
      Array.from({ length: 20 }, (_, i) => lead(`kelasi${i}`, { nextContactDate: inDays(2) })),
    );

    const r = await distributeLeadsCore();
    expect(r.autoLimit).toBe(10); // eng kam chegara
    expect(r.pulled).toBe(9); // 10 - 1
    expect(r.assigned).toBe(10);
  });

  it("eng kam chegara 0 bo'lsa hech narsa tortilmaydi", async () => {
    policy({ minPerOperator: 0, maxPerOperator: 50 });
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: null }]);
    setPool([lead("bugun")], [lead("kelasi", { nextContactDate: inDays(2) })]);

    const r = await distributeLeadsCore();
    expect(r.pulled).toBe(0);
    expect(r.assigned).toBe(1);
  });

  it("qat'iy kvota qo'yilgan operator avtomatikka bo'ysunmaydi", async () => {
    policy({ minPerOperator: 0, maxPerOperator: 50 });
    userFindMany.mockResolvedValue([
      { id: "qatiy", dailyLimit: 3 },
      { id: "avto", dailyLimit: null },
    ]);
    setPool(Array.from({ length: 40 }, (_, i) => lead(`c${i}`)));

    const r = await distributeLeadsCore();
    const byOp = new Map<string, number>();
    for (const call of clientUpdateMany.mock.calls) {
      const op = call[0].data.assignedToId;
      if (op) byOp.set(op, (byOp.get(op) ?? 0) + call[0].where.id.in.length);
    }
    expect(byOp.get("qatiy")).toBe(3);
    expect(byOp.get("avto")).toBe(r.autoLimit);
  });

  // --- Smena bo'yicha kamaytirish (kechki < kunduzgi) ---

  it("smenasiz chaqiruvda kechki operator kunduzgidan aynan 40% kamroq oladi (og'irlikli formula)", async () => {
    policy({ minPerOperator: 0, maxPerOperator: 100, nightShiftDiscountPercent: 40 });
    dutyDayFindMany.mockResolvedValue([
      { userId: "day1", shift: "DAY" },
      { userId: "day2", shift: "DAY" },
      { userId: "night1", shift: "NIGHT" },
    ]);
    userFindMany.mockResolvedValue([
      { id: "day1", dailyLimit: null },
      { id: "day2", dailyLimit: null },
      { id: "night1", dailyLimit: null },
    ]);
    // 130 = 2*50 + 1*30 — kunduzgi/kechki kvota aniq bo'linsin (yaxlitlashsiz).
    setPool(Array.from({ length: 130 }, (_, i) => lead(`c${i}`)));

    const r = await distributeLeadsCore();
    expect(r.autoLimit).toBe(50);
    const byOp = new Map<string, number>();
    for (const call of clientUpdateMany.mock.calls) {
      const op = call[0].data.assignedToId;
      if (op) byOp.set(op, (byOp.get(op) ?? 0) + call[0].where.id.in.length);
    }
    expect(byOp.get("day1")).toBe(50);
    expect(byOp.get("day2")).toBe(50); // kunduzgilar TENG
    expect(byOp.get("night1")).toBe(30); // 50 * (1 - 0.4)
  });

  it("NIGHT alohida chaqirilganda, DAY oldin saqlagan bazaviy kvotadan 40% kam oladi", async () => {
    policy({ minPerOperator: 0, maxPerOperator: 100, nightShiftDiscountPercent: 40 });
    dutyDayFindMany.mockResolvedValue([{ userId: "night1", shift: "NIGHT" }]);
    userFindMany.mockResolvedValue([{ id: "night1", dailyLimit: null }]);
    getTodayDayAutoLimits.mockResolvedValue({ __fallback__: 20 }); // DAY ishga tushganda saqlagan qiymat
    setPool(Array.from({ length: 100 }, (_, i) => lead(`c${i}`)));

    const r = await distributeLeadsCore("NIGHT");
    expect(r.autoLimit).toBe(20); // dayAuto DAY'dan olindi
    expect(r.assigned).toBe(12); // round(20 * 0.6)
  });

  it("DAY ishga tushganda bugungi bazaviy kvota saqlanadi", async () => {
    policy({ minPerOperator: 0, maxPerOperator: 100, nightShiftDiscountPercent: 40 });
    dutyDayFindMany.mockResolvedValue([{ userId: "day1", shift: "DAY" }]);
    userFindMany.mockResolvedValue([{ id: "day1", dailyLimit: null }]);
    setPool(Array.from({ length: 30 }, (_, i) => lead(`c${i}`)));

    await distributeLeadsCore("DAY");
    expect(setTodayDayAutoLimits).toHaveBeenCalledWith({ __fallback__: 30 }, expect.any(Date));
  });

  it("qarzdorni qayta ko'rsatish oralig'i so'rovga kiradi", async () => {
    policy({ debtorCooldownDays: 5 });
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: null }]);
    setPool([lead("c0")]);

    await distributeLeadsCore();
    const debtorClause = clientFindMany.mock.calls[0][0].where.OR[1];
    expect(debtorClause.OR).toEqual([
      { lastContactedAt: null },
      { lastContactedAt: { lt: expect.any(Date) } },
    ]);
  });

  it("taqsimotdan keyin audit yoziladi (fokus nomi bilan)", async () => {
    userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 50 }]);
    setPool([lead("c0")]);
    await distributeLeadsCore();
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit.mock.calls[0][1].detail).toContain("Muvozanat");
  });

  // --- Viloyat bo'yicha taqsimlash (LoadPolicy.regionBasedDistribution) ---

  describe("viloyat bo'yicha taqsimlash", () => {
    it("o'chirilgan bo'lsa — regions bo'lsa ham eskicha umumiy hovuzga tushadi", async () => {
      policy({ minPerOperator: 0, maxPerOperator: 50, regionBasedDistribution: false });
      userFindMany.mockResolvedValue([
        { id: "toshkent-op", dailyLimit: 50, region: null, regions: "Toshkent" },
        { id: "andijon-op", dailyLimit: 50, region: null, regions: "Andijon" },
      ]);
      setPool([
        lead("t0", { region: "Toshkent" }),
        lead("a0", { region: "Andijon" }),
        lead("x0", { region: null }),
      ]);

      const r = await distributeLeadsCore();
      expect(r.regionEnabled).toBe(false);
      expect(r.assigned).toBe(3);
      // Ikkalasi ham hammasidan olishi mumkin — viloyat cheklovi yo'q.
    });

    it("yoqilgan bo'lsa — mijoz FAQAT o'z viloyatini qoplovchi operatorga tushadi", async () => {
      policy({ minPerOperator: 0, maxPerOperator: 50, regionBasedDistribution: true });
      userFindMany.mockResolvedValue([
        { id: "toshkent-op", dailyLimit: 50, region: null, regions: "Toshkent" },
        { id: "andijon-op", dailyLimit: 50, region: null, regions: "Andijon" },
      ]);
      setPool([
        lead("t0", { region: "Toshkent" }),
        lead("t1", { region: "Toshkent" }),
        lead("a0", { region: "Andijon" }),
      ]);

      const r = await distributeLeadsCore();
      expect(r.regionEnabled).toBe(true);

      const byOp = new Map<string, string[]>();
      for (const call of clientUpdateMany.mock.calls) {
        const op = call[0].data.assignedToId;
        if (op) byOp.set(op, [...(byOp.get(op) ?? []), ...(call[0].where.id.in as string[])]);
      }
      expect(byOp.get("toshkent-op")!.sort()).toEqual(["t0", "t1"]);
      expect(byOp.get("andijon-op")).toEqual(["a0"]);
      expect(r.assigned).toBe(3);
    });

    it("viloyatsiz mijoz umumiy/fallback hovuzga tushadi (hech kim qoplamasa ham beriladi)", async () => {
      policy({ minPerOperator: 0, maxPerOperator: 50, regionBasedDistribution: true });
      userFindMany.mockResolvedValue([
        { id: "toshkent-op", dailyLimit: 50, region: null, regions: "Toshkent" },
      ]);
      setPool([lead("t0", { region: "Toshkent" }), lead("no-region", { region: null })]);

      const r = await distributeLeadsCore();
      expect(r.fallbackAssigned).toBe(1);
      expect(r.regionAssigned).toBe(1);
      const all = assignedIds();
      expect(all.sort()).toEqual(["no-region", "t0"]);
    });

    it("hech kim qoplamagan viloyat mijozi ham umumiy hovuz orqali beriladi", async () => {
      policy({ minPerOperator: 0, maxPerOperator: 50, regionBasedDistribution: true });
      userFindMany.mockResolvedValue([
        { id: "toshkent-op", dailyLimit: 50, region: null, regions: "Toshkent" },
      ]);
      // "Andijon"ni hech kim qoplamaydi — baribir toshkent-op orqali beriladi.
      setPool([lead("a0", { region: "Andijon" })]);

      const r = await distributeLeadsCore();
      expect(r.fallbackAssigned).toBe(1);
      expect(assignedIds()).toEqual(["a0"]);
    });

    it("bir viloyatni bir nechta operator qoplasa — ular orasida bo'linadi", async () => {
      policy({ minPerOperator: 0, maxPerOperator: 50, regionBasedDistribution: true });
      userFindMany.mockResolvedValue([
        { id: "op1", dailyLimit: 3, region: null, regions: "Toshkent" },
        { id: "op2", dailyLimit: 3, region: null, regions: "Toshkent" },
      ]);
      setPool(Array.from({ length: 6 }, (_, i) => lead(`t${i}`, { region: "Toshkent" })));

      const r = await distributeLeadsCore();
      expect(r.assigned).toBe(6);
      const byOp = new Map<string, number>();
      for (const call of clientUpdateMany.mock.calls) {
        const op = call[0].data.assignedToId;
        if (op) byOp.set(op, (byOp.get(op) ?? 0) + call[0].where.id.in.length);
      }
      expect(byOp.get("op1")).toBe(3);
      expect(byOp.get("op2")).toBe(3);
    });

    it("ko'p viloyatli operator ikkala viloyatidan ham lid oladi (jami dailyLimit ichida)", async () => {
      policy({ minPerOperator: 0, maxPerOperator: 50, regionBasedDistribution: true });
      userFindMany.mockResolvedValue([
        { id: "op1", dailyLimit: 10, region: null, regions: "Toshkent,Andijon" },
      ]);
      setPool([
        ...Array.from({ length: 3 }, (_, i) => lead(`t${i}`, { region: "Toshkent" })),
        ...Array.from({ length: 3 }, (_, i) => lead(`a${i}`, { region: "Andijon" })),
      ]);

      const r = await distributeLeadsCore();
      expect(r.assigned).toBe(6);
      expect(assignedIds().sort()).toEqual(["a0", "a1", "a2", "t0", "t1", "t2"]);
    });

    it("boshqa viloyatning ortiqcha lidlari operatorning o'z sig'imiga sig'masa navbatda qoladi (boshqaga oqmaydi)", async () => {
      policy({ minPerOperator: 0, maxPerOperator: 50, regionBasedDistribution: true });
      userFindMany.mockResolvedValue([
        { id: "toshkent-op", dailyLimit: 2, region: null, regions: "Toshkent" },
        { id: "andijon-op", dailyLimit: 50, region: null, regions: "Andijon" },
      ]);
      setPool(Array.from({ length: 5 }, (_, i) => lead(`t${i}`, { region: "Toshkent" })));

      const r = await distributeLeadsCore();
      expect(r.assigned).toBe(2); // faqat toshkent-op'ning 2 tasi
      const unassignedCall = clientUpdateMany.mock.calls.find(
        (c) => c[0].data.assignedToId === null,
      );
      expect(unassignedCall![0].where.id.in.length).toBe(3);
      // andijon-op hech narsa olmadi — Toshkentning ortiqchasi unga oqmadi.
      const toAndijon = clientUpdateMany.mock.calls.filter(
        (c) => c[0].data.assignedToId === "andijon-op",
      );
      expect(toAndijon).toHaveLength(0);
    });

    it("viloyatda bugun hovuz bo'sh bo'lsa ham, o'z viloyatidan oldinga tortiladi (fallbackka oqmaydi)", async () => {
      policy({ minPerOperator: 5, maxPerOperator: 50, regionBasedDistribution: true });
      userFindMany.mockResolvedValue([
        { id: "toshkent-op", dailyLimit: null, region: null, regions: "Toshkent" },
      ]);
      // Bugun Toshkentda muddati kelgan hech kim yo'q, lekin kelajakdagilar bor.
      setPool(
        [],
        Array.from({ length: 10 }, (_, i) =>
          lead(`kelasi${i}`, { region: "Toshkent", nextContactDate: inDays(2) }),
        ),
      );

      const r = await distributeLeadsCore();
      expect(r.pulled).toBeGreaterThan(0);
      expect(r.regionAssigned).toBeGreaterThan(0);
      expect(r.fallbackAssigned).toBe(0);
    });

    it("operatorga hali viloyat biriktirilmagan bo'lsa — u faqat fallback orqali oladi", async () => {
      policy({ minPerOperator: 0, maxPerOperator: 50, regionBasedDistribution: true });
      userFindMany.mockResolvedValue([{ id: "op1", dailyLimit: 10, region: null, regions: null }]);
      setPool([lead("c0", { region: "Toshkent" }), lead("c1", { region: null })]);

      const r = await distributeLeadsCore();
      // Hech kim "Toshkent"ni qoplamagani uchun ikkalasi ham fallback orqali beriladi.
      expect(r.fallbackAssigned).toBe(2);
      expect(assignedIds().sort()).toEqual(["c0", "c1"]);
    });
  });
});
