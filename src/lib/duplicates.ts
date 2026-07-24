// Bo'lishi mumkin bo'lgan dublikat/o'xshash mijozlarni aniqlash.
//
// Baza bir necha manbadan to'ldirilgan (qo'lda kiritish, "Tex padderjka" va
// "Klient baza" sheet importlari, Telegram chek qabul) — shu sabab bitta
// restoran ba'zan ikki-uch marta yozilgan bo'ladi. Bu modul HECH NARSANI
// o'chirmaydi/birlashtirmaydi; faqat inson ko'rib chiqishi uchun o'xshash
// yozuvlarni guruhlaydi.
//
// Signallar (ishonchlilik tartibida):
//   1. telefon  — oxirgi 9 raqam (birlamchi `phone` + barcha `ClientPhone`)
//   2. shartnoma — normallashtirilgan raqam (AB130326158 ...)
//   3. nom      — normallashtirilgan restoran nomi (TO'LIQ mos)
//
// Telefon yoki shartnoma bo'yicha ulangan guruh — "yuqori" ishonch; faqat nom
// bo'yicha ulangan — "o'rta". Nom eng shovqinli signal, shuning uchun juda
// umumiy (ko'p mijozga mos) yoki juda qisqa nomlar bo'yicha birlashtirmaymiz.

/** Telefonning solishtirish kaliti: oxirgi 9 raqam ("998" prefiksisiz). */
export function phoneDupKey(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 9) return "";
  const key = d.slice(-9);
  // O'zbek mobil kodlari 2..9 bilan boshlanadi — "000000000" kabi axlatni tashla
  return /^[2-9]/.test(key) ? key : "";
}

/** Shartnoma kaliti: bo'shliq/tire olib tashlanadi, kamida 4 ta raqam kerak. */
export function contractDupKey(raw: string | null | undefined): string {
  const s = (raw ?? "").replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z]{1,3}\d{4,}$/.test(s) ? s : "";
}

/** Nom kaliti: kichik harf, ortiqcha bo'shliqlar tozalangan. */
export function nameDupKey(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  // Juda qisqa nom (masalan "kafe") shovqin — kamida 4 belgidan iborat bo'lsin.
  return s.length >= 4 ? s : "";
}

// Bitta nom shu sondan ortiq mijozga mos kelsa — u umumiy so'z (masalan
// "restoran") deb hisoblanadi va nom bo'yicha birlashtirilmaydi. Telefon/
// shartnoma bunday chegaraga tushmaydi (ular o'zi noyob).
const GENERIC_NAME_LIMIT = 6;

export type DupClientInput = {
  id: string;
  fullName: string;
  restaurantName: string;
  region?: string | null;
  phone: string;
  contractNumber?: string | null;
  status?: string;
  stage?: string;
  monthlyAmount?: number;
  currency?: string;
  createdAt?: Date | string;
  /** Qo'shimcha telefonlar (ClientPhone.number). */
  phones?: { number: string }[];
};

export type DupReason = "phone" | "contract" | "name";

export type DupGroup<T extends DupClientInput = DupClientInput> = {
  /** Barqaror guruh kaliti (a'zolar id'laridan) — React key uchun. */
  key: string;
  reasons: DupReason[];
  confidence: "high" | "medium";
  clients: T[];
};

// —— Union-Find (Disjoint Set) ——
class UF {
  private parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Bitta mijozning barcha telefon kalitlari (birlamchi + qo'shimchalar). */
function phoneKeysOf(c: DupClientInput): string[] {
  const keys = new Set<string>();
  const primary = phoneDupKey(c.phone);
  if (primary) keys.add(primary);
  for (const p of c.phones ?? []) {
    const k = phoneDupKey(p.number);
    if (k) keys.add(k);
  }
  return [...keys];
}

/**
 * Mijozlar ro'yxatidan bo'lishi mumkin bo'lgan dublikat guruhlarni topadi.
 * Faqat 2+ mijozdan iborat guruhlar qaytariladi. Guruhlar ichida mijozlar
 * yaratilgan sana bo'yicha (eskisi birinchi) tartiblanadi; guruhlar esa
 * ishonch (yuqori birinchi) va o'lcham bo'yicha.
 */
export function findDuplicateGroups<T extends DupClientInput>(
  clients: T[],
): DupGroup<T>[] {
  const byId = new Map<string, T>();
  for (const c of clients) byId.set(c.id, c);

  // Har signal turi bo'yicha: kalit -> shu kalitga ega mijoz id'lari
  const byPhone = new Map<string, string[]>();
  const byContract = new Map<string, string[]>();
  const byName = new Map<string, string[]>();

  for (const c of clients) {
    for (const k of phoneKeysOf(c)) push(byPhone, k, c.id);
    const ck = contractDupKey(c.contractNumber);
    if (ck) push(byContract, ck, c.id);
    const nk = nameDupKey(c.restaurantName);
    if (nk) push(byName, nk, c.id);
  }

  const uf = new UF();
  const link = (ids: string[]) => {
    for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
  };
  for (const ids of byPhone.values()) if (ids.length > 1) link(ids);
  for (const ids of byContract.values()) if (ids.length > 1) link(ids);
  for (const [, ids] of byName)
    if (ids.length > 1 && ids.length <= GENERIC_NAME_LIMIT) link(ids);

  // Komponentlarni yig'ish
  const comps = new Map<string, T[]>();
  for (const c of clients) {
    const root = uf.find(c.id);
    if (!comps.has(root)) comps.set(root, []);
    comps.get(root)!.push(c);
  }

  const groups: DupGroup<T>[] = [];
  for (const members of comps.values()) {
    if (members.length < 2) continue;
    const reasons = reasonsFor(members);
    if (reasons.length === 0) continue; // GENERIC_NAME sabab yolg'iz qolgan holat
    const confidence: DupGroup<T>["confidence"] =
      reasons.includes("phone") || reasons.includes("contract")
        ? "high"
        : "medium";
    const sorted = [...members].sort(
      (a, b) => ts(a.createdAt) - ts(b.createdAt),
    );
    groups.push({
      key: sorted.map((m) => m.id).join("_"),
      reasons,
      confidence,
      clients: sorted,
    });
  }

  const rank = { high: 0, medium: 1 } as const;
  groups.sort(
    (a, b) =>
      rank[a.confidence] - rank[b.confidence] ||
      b.clients.length - a.clients.length,
  );
  return groups;
}

/** Guruh a'zolari qaysi signallar bo'yicha bog'langanini aniqlaydi. */
function reasonsFor(members: DupClientInput[]): DupReason[] {
  const reasons: DupReason[] = [];
  if (sharesKey(members, (c) => phoneKeysOf(c))) reasons.push("phone");
  if (sharesKey(members, (c) => keyList(contractDupKey(c.contractNumber))))
    reasons.push("contract");
  if (sharesKey(members, (c) => keyList(nameDupKey(c.restaurantName))))
    reasons.push("name");
  return reasons;
}

/** Guruh ichida 2+ a'zo bitta kalitni baham ko'radimi? */
function sharesKey(
  members: DupClientInput[],
  keysOf: (c: DupClientInput) => string[],
): boolean {
  const seen = new Map<string, number>();
  for (const m of members)
    for (const k of new Set(keysOf(m)))
      seen.set(k, (seen.get(k) ?? 0) + 1);
  for (const n of seen.values()) if (n > 1) return true;
  return false;
}

function keyList(k: string): string[] {
  return k ? [k] : [];
}

function push(map: Map<string, string[]>, key: string, id: string): void {
  const arr = map.get(key);
  if (arr) arr.push(id);
  else map.set(key, [id]);
}

function ts(v: Date | string | undefined): number {
  if (!v) return 0;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
}
