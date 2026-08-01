// Uskuna (ombor -> usta -> mijoz) analitikasi.
//
// Tizimdagi uskuna oqimi: ombor'ga KIRIM -> ustaga taqsimot yoki to'g'ridan-to'g'ri
// Toshkentda mijozga o'rnatish -> ustadan mijozga o'rnatish. Yon oqimlar: ustadan
// omborga qaytarish, mijozdan qaytarib olish, brak.
//
// Yagona manba — `EquipmentMovement` jurnali. Joriy qoldiq `InventoryStock`
// (ombor/usta/brak) va `ClientEquipment` (mijozlarda) da turadi.
//
// Bu fayldagi hisob-kitob funksiyalari SOF (DB'ga tegmaydi) — testlanadi va
// `getEquipmentOverview()` ularni bitta so'rovlar to'plami ustida ishlatadi.
// Valyutalar hech qachon birlashtirilmaydi (finance.ts bilan bir xil konvensiya).

import { db } from "./db";
import { BASE_PROGRAM_USD, UZBEK_MONTHS } from "./constants";

export const WAREHOUSE_ID = "WAREHOUSE";

// ---------------------------------------------------------------------------
// Harakat turlari
// ---------------------------------------------------------------------------

/** Bitta uskuna harakatining oqimdagi o'rni. */
export type FlowKind =
  | "INBOUND" // -> Ombor (yetkazib beruvchidan kirim)
  | "TO_USTA" // Ombor -> Usta (taqsimot)
  | "USTA_BACK" // Usta -> Ombor (ishlatilmagan qaytdi)
  | "INSTALL_WAREHOUSE" // Ombor -> Mijoz (Toshkentda o'rnatildi)
  | "INSTALL_USTA" // Usta -> Mijoz (usta olib borib o'rnatdi)
  | "INSTALL_LEGACY" // ? -> Mijoz (tarixiy/import: manba yozilmagan)
  | "SCRAP" // -> Brak
  | "CLIENT_RETURN" // Mijoz -> Ombor/Usta (qaytarib olindi)
  | "ADJUST_OUT" // Ombor -> ? (inventarizatsiya: kamaytirish)
  | "OTHER";

export type MovementLike = {
  quantity: number;
  fromType: string | null;
  toType: string | null;
  createdAt: Date;
  equipmentTypeId: string;
  fromId?: string | null;
  toId?: string | null;
};

/**
 * Harakatni oqim turiga ajratadi. Tartib MUHIM: brak har qanday manbadan
 * kelishi mumkin, mijozdan qaytarish esa har qanday manzilga borishi mumkin —
 * shu bois ular avval tekshiriladi.
 */
export function classifyMovement(m: Pick<MovementLike, "fromType" | "toType">): FlowKind {
  const from = m.fromType ?? null;
  const to = m.toType ?? null;

  if (to === "BRAK") return "SCRAP";
  if (from === "CLIENT") return "CLIENT_RETURN";
  if (to === "CLIENT") {
    if (from === "WAREHOUSE") return "INSTALL_WAREHOUSE";
    if (from === "USTA") return "INSTALL_USTA";
    // Manba yo'q — "allaqachon o'rnatilgan (import)" yozuvlari. Bu uskuna hech
    // qachon tizim omboridan o'tmagan, shuning uchun manba kesimida alohida turadi.
    return "INSTALL_LEGACY";
  }
  if (from === "WAREHOUSE" && to === "USTA") return "TO_USTA";
  if (from === "USTA" && to === "WAREHOUSE") return "USTA_BACK";
  if (!from && to === "WAREHOUSE") return "INBOUND";
  if (from === "WAREHOUSE" && !to) return "ADJUST_OUT";
  return "OTHER";
}

/** O'rnatish (mijozga ketgan) harakatimi — manba kesimi shular ustida hisoblanadi. */
export function isInstall(kind: FlowKind): boolean {
  return (
    kind === "INSTALL_WAREHOUSE" || kind === "INSTALL_USTA" || kind === "INSTALL_LEGACY"
  );
}

// ---------------------------------------------------------------------------
// Oylik oqim
// ---------------------------------------------------------------------------

export type FlowMonth = {
  key: string; // "2026-07"
  label: string; // "Iyul"
  inbound: number;
  toUsta: number;
  ustaBack: number;
  installWarehouse: number;
  installUsta: number;
  installLegacy: number;
  scrap: number;
  clientReturn: number;
  /** Mijozga ketgan jami (uch manbadan) — grafikda bitta ustun. */
  installed: number;
};

const emptyFlowMonth = (key: string, label: string): FlowMonth => ({
  key,
  label,
  inbound: 0,
  toUsta: 0,
  ustaBack: 0,
  installWarehouse: 0,
  installUsta: 0,
  installLegacy: 0,
  scrap: 0,
  clientReturn: 0,
  installed: 0,
});

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * Oxirgi `months` oy bo'yicha oqimni guruhlaydi (eskidan yangiga; joriy oy
 * oxirgi). Oraliqqa tushmagan harakatlar e'tiborga olinmaydi — chunki grafik
 * aynan shu oyna uchun.
 */
export function bucketFlowByMonth(
  movements: MovementLike[],
  months: number,
  now: Date = new Date(),
): FlowMonth[] {
  const buckets: FlowMonth[] = [];
  const byKey = new Map<string, FlowMonth>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const b = emptyFlowMonth(monthKey(d), UZBEK_MONTHS[d.getMonth()]);
    buckets.push(b);
    byKey.set(b.key, b);
  }

  for (const m of movements) {
    const b = byKey.get(monthKey(m.createdAt));
    if (!b) continue;
    const qty = m.quantity;
    switch (classifyMovement(m)) {
      case "INBOUND":
        b.inbound += qty;
        break;
      case "TO_USTA":
        b.toUsta += qty;
        break;
      case "USTA_BACK":
        b.ustaBack += qty;
        break;
      case "INSTALL_WAREHOUSE":
        b.installWarehouse += qty;
        b.installed += qty;
        break;
      case "INSTALL_USTA":
        b.installUsta += qty;
        b.installed += qty;
        break;
      case "INSTALL_LEGACY":
        b.installLegacy += qty;
        b.installed += qty;
        break;
      case "SCRAP":
        b.scrap += qty;
        break;
      case "CLIENT_RETURN":
        b.clientReturn += qty;
        break;
      default:
        break;
    }
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// O'rnatish manbasi (usta / sklad)
// ---------------------------------------------------------------------------

export type InstallSource = {
  fromUsta: number;
  fromWarehouse: number;
  /** Manbasi yozilmagan tarixiy yozuvlar — foizga kiritilmaydi, alohida ko'rsatiladi. */
  legacy: number;
  /** fromUsta + fromWarehouse (aniq manbali). */
  known: number;
  ustaPct: number; // %, aniq manbalilar ichida
  warehousePct: number;
};

/** Mijozga ketgan harakatlarni manba bo'yicha ajratadi. */
export function installSourceBreakdown(movements: MovementLike[]): InstallSource {
  let fromUsta = 0;
  let fromWarehouse = 0;
  let legacy = 0;
  for (const m of movements) {
    const k = classifyMovement(m);
    if (k === "INSTALL_USTA") fromUsta += m.quantity;
    else if (k === "INSTALL_WAREHOUSE") fromWarehouse += m.quantity;
    else if (k === "INSTALL_LEGACY") legacy += m.quantity;
  }
  const known = fromUsta + fromWarehouse;
  return {
    fromUsta,
    fromWarehouse,
    legacy,
    known,
    ustaPct: known ? Math.round((fromUsta / known) * 100) : 0,
    warehousePct: known ? Math.round((fromWarehouse / known) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Usta kesimi
// ---------------------------------------------------------------------------

export type UstaFlow = {
  ustaId: string;
  ustaName: string;
  received: number; // ombordan olgan
  installed: number; // mijozga o'rnatgan
  returned: number; // omborga qaytargan
  scrapped: number; // brakka chiqargan
  onHand: number; // hozir qo'lida (InventoryStock)
  /** received - installed - returned - scrapped. onHand'dan farq qilsa — nomuvofiqlik. */
  expected: number;
  diff: number; // onHand - expected (0 bo'lishi kerak)
};

/**
 * Har bir usta bo'yicha oqim. `movements` — TO'LIQ tarix bo'lishi kerak (oyna
 * bilan cheklangan bo'lsa `expected` noto'g'ri chiqadi), `onHand` esa joriy qoldiq.
 */
export function perUstaFlow(
  movements: MovementLike[],
  ustalar: { id: string; name: string }[],
  onHandByUsta: Map<string, number>,
): UstaFlow[] {
  const rows = new Map<string, UstaFlow>(
    ustalar.map((u) => [
      u.id,
      {
        ustaId: u.id,
        ustaName: u.name,
        received: 0,
        installed: 0,
        returned: 0,
        scrapped: 0,
        onHand: onHandByUsta.get(u.id) ?? 0,
        expected: 0,
        diff: 0,
      },
    ]),
  );

  for (const m of movements) {
    const kind = classifyMovement(m);
    if (kind === "TO_USTA") {
      const r = m.toId ? rows.get(m.toId) : undefined;
      if (r) r.received += m.quantity;
    } else if (kind === "INSTALL_USTA" || kind === "USTA_BACK") {
      const r = m.fromId ? rows.get(m.fromId) : undefined;
      if (!r) continue;
      if (kind === "INSTALL_USTA") r.installed += m.quantity;
      else r.returned += m.quantity;
    } else if (kind === "SCRAP" && m.fromType === "USTA") {
      const r = m.fromId ? rows.get(m.fromId) : undefined;
      if (r) r.scrapped += m.quantity;
    } else if (kind === "CLIENT_RETURN" && m.toType === "USTA") {
      // Mijozdan ustaga qaytdi — ustaning qo'lidagi zaxira ortadi.
      const r = m.toId ? rows.get(m.toId) : undefined;
      if (r) r.received += m.quantity;
    }
  }

  for (const r of rows.values()) {
    r.expected = r.received - r.installed - r.returned - r.scrapped;
    r.diff = r.onHand - r.expected;
  }
  return [...rows.values()].sort((a, b) => b.installed - a.installed);
}

// ---------------------------------------------------------------------------
// 29$ biznes qoidasi (dastur-only vs ijara)
// ---------------------------------------------------------------------------

export type RuleClient = {
  id: string;
  restaurantName: string;
  monthlyAmount: number;
  currency: string;
  rentedQty: number; // ijaradagi uskuna soni (ClientEquipment, ownership=RENTAL)
};

/**
 * Tekshiruv natijasi. `T` — chaqiruvchi bergan mijoz shakli: qo'shimcha
 * maydonlar (telefon, operator, ...) yo'qolmasligi uchun generik, aks holda
 * ro'yxatni ko'rsatish uchun mijozlarni id bo'yicha qayta ulash kerak bo'lardi.
 */
export type RuleCheck<T extends RuleClient = RuleClient> = {
  /** Oyligi aynan bazaviy narx (29$), lekin ijara uskunasi biriktirilgan. */
  baseWithEquipment: T[];
  /** Oyligi bazaviy narxdan ORTIQ, lekin ijara uskunasi biriktirilmagan. */
  aboveBaseWithoutEquipment: T[];
  /** Oyligi bazaviy narxdan PAST (0 dan katta) — shartnoma/summa shubhali. */
  belowBase: T[];
  /** Oyligi umuman kiritilmagan (0) — tekshirib bo'lmaydi, to'ldirish kerak. */
  zeroAmount: T[];
  /** Qoida faqat USD uchun — UZS mijozlar tekshiruvdan tashqarida. */
  skippedNonUsd: number;
  /** Oyligi 0 — hali to'ldirilmagan (`zeroAmount.length` bilan bir xil). */
  skippedZero: number;
  checked: number;
  okCount: number;
};

const nearly = (a: number, b: number) => Math.abs(a - b) < 0.01;

/**
 * Biznes qoidasi: USD mijoz aynan `BASE_PROGRAM_USD` to'lasa — faqat dastur,
 * uskuna ijarasi YO'Q. Undan ortiq to'lasa — farq uskuna ijarasi, ya'ni mijozda
 * ijara uskunasi BO'LISHI shart. Ikkala yo'nalishdagi buzilish ham ma'lumot
 * to'liq emasligini bildiradi (shartnomadan to'ldirish kerak).
 */
export function check29Rule<T extends RuleClient>(
  clients: T[],
  baseUsd: number = BASE_PROGRAM_USD,
): RuleCheck<T> {
  const res: RuleCheck<T> = {
    baseWithEquipment: [],
    aboveBaseWithoutEquipment: [],
    belowBase: [],
    zeroAmount: [],
    skippedNonUsd: 0,
    skippedZero: 0,
    checked: 0,
    okCount: 0,
  };

  for (const c of clients) {
    if (c.currency !== "USD") {
      res.skippedNonUsd++;
      continue;
    }
    if (c.monthlyAmount <= 0) {
      res.skippedZero++;
      res.zeroAmount.push(c);
      continue;
    }
    res.checked++;
    if (nearly(c.monthlyAmount, baseUsd)) {
      if (c.rentedQty > 0) res.baseWithEquipment.push(c);
      else res.okCount++;
    } else if (c.monthlyAmount > baseUsd) {
      if (c.rentedQty === 0) res.aboveBaseWithoutEquipment.push(c);
      else res.okCount++;
    } else {
      res.belowBase.push(c);
    }
  }

  const byAmount = (a: RuleClient, b: RuleClient) => b.monthlyAmount - a.monthlyAmount;
  res.baseWithEquipment.sort(byAmount);
  res.aboveBaseWithoutEquipment.sort(byAmount);
  res.belowBase.sort(byAmount);
  return res;
}

/**
 * Oylik to'lovdan kelib chiqib mijozda BO'LISHI kerak bo'lgan ijara qiymati
 * (USD/oy): oylik summa - bazaviy dastur narxi. Manfiy bo'lsa 0.
 * Shartnomadan to'ldirishda "nechta uskuna" ni taxmin qilish uchun ishlatiladi.
 */
export function expectedRentalValue(
  monthlyAmount: number,
  currency: string,
  baseUsd: number = BASE_PROGRAM_USD,
): number {
  if (currency !== "USD") return 0;
  return Math.max(0, monthlyAmount - baseUsd);
}

// ---------------------------------------------------------------------------
// To'liq ko'rinish (DB)
// ---------------------------------------------------------------------------

/**
 * KPI kartochkasi bosilganda ochiladigan batafsil ma'lumot. Har bir blok o'z
 * kesimida — sonning QAYERDAN kelganini ko'rsatadi.
 */
export type EquipmentDetail = {
  /** Ombor: tur bo'yicha qoldiq va qiymat. */
  warehouse: { name: string; qty: number; unitPrice: number; value: number; minStock: number; low: boolean }[];
  /** Ustalar: har usta -> qaysi texnikadan nechta. */
  usta: { ustaId: string; ustaName: string; total: number; items: { name: string; qty: number }[] }[];
  /** Mijozlar: tur bo'yicha ijara/sotuv ajratilgan. */
  client: { name: string; rental: number; sold: number; total: number }[];
  /** Eng ko'p uskunali mijozlar (batafsil ro'yxat uchun). */
  topClients: { id: string; name: string; qty: number; rental: number; sold: number }[];
  /** Ijara daromadi: tur bo'yicha hissa. */
  rental: { name: string; qty: number; unitPrice: number; monthly: number; clients: number }[];
  /** Ijara uskunasi bor mijozlar soni. */
  rentalClientCount: number;
  /** Brak: tur bo'yicha qoldiq. */
  brak: { name: string; qty: number }[];
  /** Oxirgi brak harakatlari (kim, qachon, qayerdan, izoh). */
  brakRecent: { date: Date; typeName: string; qty: number; from: string; note: string | null; user: string }[];
  /** Kam zaxira: yetishmayotgan miqdor bilan. */
  lowStock: { name: string; qty: number; minStock: number; deficit: number; usedLast90: number }[];
  /** Nofaol mijozlarda qolib ketgan yozuvlar (tozalash uchun ro'yxat). */
  stale: { id: string; name: string; status: string; rental: number; sold: number }[];
};

export type EquipmentOverview = {
  // Joriy holat
  warehouseUnits: number;
  warehouseValue: number;
  ustaUnits: number;
  clientUnits: number;
  brakUnits: number;
  rentalUnits: number;
  soldUnits: number;
  monthlyRentalUsd: number;
  /**
   * Nofaol (o'chirilgan/kutilayotgan) mijozlarda qolib ketgan uskuna — yuqoridagi
   * jamilarga KIRMAYDI. Nolga teng bo'lishi kerak: noldan katta bo'lsa, uskuna
   * qaytarilgan-u yozuvi o'chirilmagan.
   */
  staleUnits: number;
  staleRentalUsd: number;
  lowStock: { name: string; warehouse: number; minStock: number }[];
  byType: { name: string; warehouse: number; usta: number; client: number; brak: number }[];
  // Dinamika
  months: FlowMonth[];
  source: InstallSource;
  ustaRows: UstaFlow[];
  // Ma'lumot sifati
  rule: RuleCheck;
  totalMovements: number;
  // KPI kartochkalarining batafsil ochilishi
  detail: EquipmentDetail;
};

/** Analitika sahifasi uchun barcha ko'rsatkichlar. `months` — oyna (default 12 oy). */
export async function getEquipmentOverview(months = 12): Promise<EquipmentOverview> {
  const [types, stock, allClientEquipment, movements, ustalar, movementCount] =
    await Promise.all([
      db.equipmentType.findMany({
        select: { id: true, name: true, salePrice: true, rentalPrice: true, minStock: true, isActive: true },
      }),
      db.inventoryStock.findMany({
        select: { locationType: true, locationId: true, equipmentTypeId: true, quantity: true },
      }),
      db.clientEquipment.findMany({
        where: { quantity: { gt: 0 } },
        select: {
          quantity: true,
          ownership: true,
          equipmentTypeId: true,
          clientId: true,
          equipmentType: { select: { rentalPrice: true } },
          client: { select: { restaurantName: true, fullName: true, status: true } },
        },
      }),
      // Usta balansi (`expected`) to'g'ri chiqishi uchun TO'LIQ tarix kerak —
      // oyna faqat oylik grafikka qo'llanadi.
      db.equipmentMovement.findMany({
        select: {
          quantity: true,
          fromType: true,
          fromId: true,
          toType: true,
          toId: true,
          createdAt: true,
          equipmentTypeId: true,
        },
      }),
      db.user.findMany({
        where: { role: "INSTALLER", isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.equipmentMovement.count(),
    ]);

  // Brak batafsili — oxirgi chiqarilganlar (kim, qayerdan, izoh).
  const [brakMovements, allUsers] = await Promise.all([
    db.equipmentMovement.findMany({
      where: { toType: "BRAK" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        createdAt: true,
        quantity: true,
        equipmentTypeId: true,
        fromType: true,
        fromId: true,
        note: true,
        byUserId: true,
      },
    }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const userName = new Map(allUsers.map((u) => [u.id, u.name]));

  const typeById = new Map(types.map((t) => [t.id, t]));
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  // "Mijozlarda" — FAQAT FAOL mijozlar.
  //
  // Ilgari holat filtrlanmasdi, shu sabab o'chirilgan/otkaz mijozlarda qolib
  // ketgan yozuvlar ham "mijozlarda turgan uskuna" va "ijara daromadi" ichiga
  // qo'shilib ketardi — boshqaruv paneli esa (faol filtri bilan) boshqa raqam
  // ko'rsatardi. Filtr SO'ROVDAN KEYIN, bitta joyda: pastdagi barcha hisob
  // (tur kesimi, mijoz kesimi, ijara daromadi) shu ro'yxatdan oziqlanadi.
  //
  // Nofaol mijozlarda qolgan yozuv — ma'lumot xatosi (uskuna aslida
  // qaytarilgan, yozuv esa o'chirilmagan), shuning uchun jamiga qo'shilmaydi,
  // lekin YO'QOLMAYDI ham: pastda alohida ko'rsatiladi va tozalanadi.
  const clientEquipment = allClientEquipment.filter((e) => e.client.status === "ACTIVE");
  const staleEquipment = allClientEquipment.filter((e) => e.client.status !== "ACTIVE");

  // Qoldiqni joylashuv turi bo'yicha yig'amiz.
  const wh = new Map<string, number>();
  const usta = new Map<string, number>();
  const brak = new Map<string, number>();
  const onHandByUsta = new Map<string, number>();
  for (const s of stock) {
    if (s.quantity <= 0) continue;
    if (s.locationType === "WAREHOUSE") {
      wh.set(s.equipmentTypeId, (wh.get(s.equipmentTypeId) ?? 0) + s.quantity);
    } else if (s.locationType === "USTA") {
      usta.set(s.equipmentTypeId, (usta.get(s.equipmentTypeId) ?? 0) + s.quantity);
      onHandByUsta.set(s.locationId, (onHandByUsta.get(s.locationId) ?? 0) + s.quantity);
    } else if (s.locationType === "BRAK") {
      brak.set(s.equipmentTypeId, (brak.get(s.equipmentTypeId) ?? 0) + s.quantity);
    }
  }

  const client = new Map<string, number>();
  let rentalUnits = 0;
  let soldUnits = 0;
  let monthlyRentalUsd = 0;
  for (const e of clientEquipment) {
    client.set(e.equipmentTypeId, (client.get(e.equipmentTypeId) ?? 0) + e.quantity);
    if (e.ownership === "RENTAL") {
      rentalUnits += e.quantity;
      monthlyRentalUsd += e.quantity * e.equipmentType.rentalPrice;
    } else {
      soldUnits += e.quantity;
    }
  }

  const warehouseUnits = [...wh.values()].reduce((a, b) => a + b, 0);
  const warehouseValue = [...wh.entries()].reduce(
    (s, [id, q]) => s + q * (typeById.get(id)?.salePrice ?? 0),
    0,
  );

  const byType = types
    .map((t) => ({
      name: t.name,
      warehouse: wh.get(t.id) ?? 0,
      usta: usta.get(t.id) ?? 0,
      client: client.get(t.id) ?? 0,
      brak: brak.get(t.id) ?? 0,
    }))
    .filter((r) => r.warehouse + r.usta + r.client + r.brak > 0)
    .sort((a, b) => b.client + b.warehouse - (a.client + a.warehouse));

  const lowStock = types
    .filter((t) => t.isActive && t.minStock > 0 && (wh.get(t.id) ?? 0) < t.minStock)
    .map((t) => ({ name: t.name, warehouse: wh.get(t.id) ?? 0, minStock: t.minStock }));

  // 29$ qoidasi — faol mijozlar bo'yicha.
  const clients = await db.client.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, restaurantName: true, monthlyAmount: true, currency: true },
  });
  const rentedByClient = new Map<string, number>();
  for (const e of clientEquipment) {
    if (e.ownership !== "RENTAL") continue;
    rentedByClient.set(e.clientId, (rentedByClient.get(e.clientId) ?? 0) + e.quantity);
  }
  const rule = check29Rule(
    clients.map((c) => ({
      id: c.id,
      restaurantName: c.restaurantName,
      monthlyAmount: c.monthlyAmount,
      currency: c.currency,
      rentedQty: rentedByClient.get(c.id) ?? 0,
    })),
  );

  // -------------------------------------------------------------------------
  // KPI kartochkalarining batafsil ochilishi
  // -------------------------------------------------------------------------

  const typeName = (id: string) => typeById.get(id)?.name ?? "—";

  const whDetail = types
    .filter((t) => (wh.get(t.id) ?? 0) > 0 || (t.isActive && t.minStock > 0))
    .map((t) => {
      const qty = wh.get(t.id) ?? 0;
      return {
        name: t.name,
        qty,
        unitPrice: t.salePrice,
        value: qty * t.salePrice,
        minStock: t.minStock,
        low: t.isActive && t.minStock > 0 && qty < t.minStock,
      };
    })
    .sort((a, b) => b.value - a.value);

  // Usta -> tur -> miqdor.
  const ustaItems = new Map<string, Map<string, number>>();
  for (const s of stock) {
    if (s.locationType !== "USTA" || s.quantity <= 0) continue;
    const m = ustaItems.get(s.locationId) ?? new Map<string, number>();
    m.set(s.equipmentTypeId, (m.get(s.equipmentTypeId) ?? 0) + s.quantity);
    ustaItems.set(s.locationId, m);
  }
  const ustaDetail = ustalar
    .map((u) => {
      const items = [...(ustaItems.get(u.id) ?? new Map<string, number>()).entries()]
        .map(([id, qty]) => ({ name: typeName(id), qty }))
        .sort((a, b) => b.qty - a.qty);
      return {
        ustaId: u.id,
        ustaName: u.name,
        total: items.reduce((s, i) => s + i.qty, 0),
        items,
      };
    })
    .filter((u) => u.total > 0)
    .sort((a, b) => b.total - a.total);

  // Mijozlardagi uskuna — tur bo'yicha va mijoz bo'yicha.
  const clientByType = new Map<string, { rental: number; sold: number }>();
  const perClient = new Map<string, { name: string; rental: number; sold: number }>();
  const rentalByType = new Map<string, { qty: number; clients: Set<string> }>();
  for (const e of clientEquipment) {
    const t = clientByType.get(e.equipmentTypeId) ?? { rental: 0, sold: 0 };
    const c = perClient.get(e.clientId) ?? {
      name: e.client.restaurantName,
      rental: 0,
      sold: 0,
    };
    if (e.ownership === "RENTAL") {
      t.rental += e.quantity;
      c.rental += e.quantity;
      const r = rentalByType.get(e.equipmentTypeId) ?? { qty: 0, clients: new Set<string>() };
      r.qty += e.quantity;
      r.clients.add(e.clientId);
      rentalByType.set(e.equipmentTypeId, r);
    } else {
      t.sold += e.quantity;
      c.sold += e.quantity;
    }
    clientByType.set(e.equipmentTypeId, t);
    perClient.set(e.clientId, c);
  }

  const clientDetail = [...clientByType.entries()]
    .map(([id, v]) => ({
      name: typeName(id),
      rental: v.rental,
      sold: v.sold,
      total: v.rental + v.sold,
    }))
    .sort((a, b) => b.total - a.total);

  const topClients = [...perClient.entries()]
    .map(([id, v]) => ({ id, name: v.name, qty: v.rental + v.sold, rental: v.rental, sold: v.sold }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 25);

  const rentalDetail = [...rentalByType.entries()]
    .map(([id, v]) => {
      const price = typeById.get(id)?.rentalPrice ?? 0;
      return {
        name: typeName(id),
        qty: v.qty,
        unitPrice: price,
        monthly: v.qty * price,
        clients: v.clients.size,
      };
    })
    .sort((a, b) => b.monthly - a.monthly);

  const brakDetail = [...brak.entries()]
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => ({ name: typeName(id), qty }))
    .sort((a, b) => b.qty - a.qty);

  const brakRecent = brakMovements.map((m) => ({
    date: m.createdAt,
    typeName: typeName(m.equipmentTypeId),
    qty: m.quantity,
    from:
      m.fromType === "USTA"
        ? (m.fromId ? (userName.get(m.fromId) ?? "Usta") : "Usta")
        : m.fromType === "WAREHOUSE"
          ? "Ombor"
          : m.fromType === "CLIENT"
            ? "Mijoz"
            : "—",
    note: m.note,
    user: m.byUserId ? (userName.get(m.byUserId) ?? "—") : "—",
  }));

  // Kam zaxira — yetishmayotgan miqdor va oxirgi 90 kunlik sarf (ombordan
  // chiqqan: ustaga taqsimot + to'g'ridan-to'g'ri o'rnatish). Qancha buyurtma
  // qilish kerakligini baholashga yordam beradi.
  const since90 = new Date(now.getTime() - 90 * 86400000);
  const used90 = new Map<string, number>();
  for (const m of movements) {
    if (m.createdAt < since90) continue;
    const k = classifyMovement(m);
    if (k === "TO_USTA" || k === "INSTALL_WAREHOUSE") {
      used90.set(m.equipmentTypeId, (used90.get(m.equipmentTypeId) ?? 0) + m.quantity);
    }
  }
  const lowStockDetail = types
    .filter((t) => t.isActive && t.minStock > 0 && (wh.get(t.id) ?? 0) < t.minStock)
    .map((t) => {
      const qty = wh.get(t.id) ?? 0;
      return {
        name: t.name,
        qty,
        minStock: t.minStock,
        deficit: t.minStock - qty,
        usedLast90: used90.get(t.id) ?? 0,
      };
    })
    .sort((a, b) => b.deficit - a.deficit);

  // Nofaol mijozlarda qolgan yozuvlar — mijoz kesimida.
  const stalePerClient = new Map<
    string,
    { id: string; name: string; status: string; rental: number; sold: number }
  >();
  let staleUnits = 0;
  let staleRentalUsd = 0;
  for (const e of staleEquipment) {
    const c = stalePerClient.get(e.clientId) ?? {
      id: e.clientId,
      // Nofaol mijozlarda restoran nomi ko'pincha bo'sh — FIO ga tushamiz,
      // aks holda ro'yxat bir nechta "—" qator bo'lib qoladi.
      name: e.client.restaurantName || e.client.fullName,
      status: e.client.status,
      rental: 0,
      sold: 0,
    };
    staleUnits += e.quantity;
    if (e.ownership === "RENTAL") {
      c.rental += e.quantity;
      staleRentalUsd += e.quantity * e.equipmentType.rentalPrice;
    } else {
      c.sold += e.quantity;
    }
    stalePerClient.set(e.clientId, c);
  }
  const staleDetail = [...stalePerClient.values()].sort(
    (a, b) => b.rental + b.sold - (a.rental + a.sold),
  );

  return {
    warehouseUnits,
    warehouseValue,
    ustaUnits: [...usta.values()].reduce((a, b) => a + b, 0),
    clientUnits: rentalUnits + soldUnits,
    brakUnits: [...brak.values()].reduce((a, b) => a + b, 0),
    rentalUnits,
    soldUnits,
    monthlyRentalUsd,
    staleUnits,
    staleRentalUsd,
    lowStock,
    byType,
    months: bucketFlowByMonth(movements, months),
    // Manba kesimi grafik bilan bir xil oynada bo'lishi kerak — aks holda
    // sarlavhadagi "oxirgi N oy" raqamlarga to'g'ri kelmaydi.
    source: installSourceBreakdown(movements.filter((m) => m.createdAt >= windowStart)),
    ustaRows: perUstaFlow(movements, ustalar, onHandByUsta),
    rule,
    totalMovements: movementCount,
    detail: {
      warehouse: whDetail,
      usta: ustaDetail,
      client: clientDetail,
      topClients,
      rental: rentalDetail,
      rentalClientCount: [...perClient.values()].filter((c) => c.rental > 0).length,
      brak: brakDetail,
      brakRecent,
      lowStock: lowStockDetail,
      stale: staleDetail,
    },
  };
}
