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
//
// "Dublikat emas" (DuplicateDismissal, src/actions/duplicates.ts): xodim
// ikkita YOZUVni ko'rib chiqib, ular aslida bir xil mijoz EMAS deb topsa,
// aynan shu JUFTLIKNI keyingi aniqlashdan chiqarib tashlaydi (edge-darajasida
// — zanjirning qolgan qismiga tegmaydi: pastdagi "telefon va nom orqali
// zanjir" holatida A-B rad etilsa, B-C hali ham alohida guruh sifatida
// ko'rinishda davom etadi, chunki ular boshqa signal bilan bog'langan).

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

/** Ikki mijoz id'sidan barqaror (tartibga bog'liq bo'lmagan) juftlik kaliti. */
export function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}_${bId}` : `${bId}_${aId}`;
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

/** Bekor qilinishi (rad etilishi) kerak bo'lgan juftlik — DB qatoridan. */
export type DismissedPair = { clientAId: string; clientBId: string };

export type DupPair<T extends DupClientInput = DupClientInput> = {
  /** Barqaror juftlik kaliti — dismiss action shuni ishlatadi. */
  key: string;
  a: T;
  b: T;
  reasons: DupReason[];
};

export type DupGroup<T extends DupClientInput = DupClientInput> = {
  /** Barqaror guruh kaliti (a'zolar id'laridan) — React key uchun. */
  key: string;
  reasons: DupReason[];
  confidence: "high" | "medium";
  clients: T[];
  /** Guruh ichidagi to'g'ridan-to'g'ri bog'langan juftliklar — "dublikat emas" tugmasi shular ustida ishlaydi. */
  pairs: DupPair<T>[];
};

const REASON_PRIORITY: DupReason[] = ["phone", "contract", "name"];

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

type Edge = { a: string; b: string; reasons: Set<DupReason> };

/**
 * Mijozlar ro'yxatidan bo'lishi mumkin bo'lgan dublikat guruhlarni topadi.
 * Faqat 2+ mijozdan iborat guruhlar qaytariladi. Guruhlar ichida mijozlar
 * yaratilgan sana bo'yicha (eskisi birinchi) tartiblanadi; guruhlar esa
 * ishonch (yuqori birinchi) va o'lcham bo'yicha.
 *
 * `dismissed` — oldin "dublikat emas" deb belgilangan juftliklar (edge
 * darajasida chiqarib tashlanadi, boshqa signal bilan hali ham bog'liq
 * bo'lsa, guruh shu bog'lanish orqali qayta hosil bo'lishi mumkin).
 */
export function findDuplicateGroups<T extends DupClientInput>(
  clients: T[],
  dismissed: DismissedPair[] = [],
): DupGroup<T>[] {
  const byId = new Map<string, T>();
  for (const c of clients) byId.set(c.id, c);

  const dismissedKeys = new Set(dismissed.map((d) => pairKey(d.clientAId, d.clientBId)));

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

  // Har bir aniq kalit-guruh ichida BARCHA juftliklarga (to'liq graf) chek
  // qo'yiladi — shu bilan "dublikat emas" aynan bitta juftlikni (edge'ni)
  // chiqarib tashlaydi, qolgan a'zolar bir-biriga hamon bog'liq qoladi.
  const edges = new Map<string, Edge>();
  function addEdges(ids: string[], reason: DupReason): void {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        const key = pairKey(a, b);
        if (dismissedKeys.has(key)) continue;
        let e = edges.get(key);
        if (!e) {
          e = { a, b, reasons: new Set() };
          edges.set(key, e);
        }
        e.reasons.add(reason);
      }
    }
  }
  for (const ids of byPhone.values()) if (ids.length > 1) addEdges(ids, "phone");
  for (const ids of byContract.values()) if (ids.length > 1) addEdges(ids, "contract");
  for (const [, ids] of byName)
    if (ids.length > 1 && ids.length <= GENERIC_NAME_LIMIT) addEdges(ids, "name");

  const uf = new UF();
  for (const e of edges.values()) uf.union(e.a, e.b);

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
    const memberIds = new Set(members.map((m) => m.id));
    const compEdges = [...edges.values()].filter((e) => memberIds.has(e.a));
    if (compEdges.length === 0) continue; // yolg'iz qolgan holat (masalan GENERIC_NAME)

    const reasonSet = new Set<DupReason>();
    for (const e of compEdges) for (const r of e.reasons) reasonSet.add(r);
    const reasons = REASON_PRIORITY.filter((r) => reasonSet.has(r));
    const confidence: DupGroup<T>["confidence"] =
      reasons.includes("phone") || reasons.includes("contract") ? "high" : "medium";

    const sorted = [...members].sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
    const orderIndex = new Map(sorted.map((m, i) => [m.id, i]));

    const pairs: DupPair<T>[] = compEdges
      .map((e) => {
        const aFirst = orderIndex.get(e.a)! <= orderIndex.get(e.b)!;
        const aId = aFirst ? e.a : e.b;
        const bId = aFirst ? e.b : e.a;
        return {
          key: pairKey(e.a, e.b),
          a: byId.get(aId)!,
          b: byId.get(bId)!,
          reasons: REASON_PRIORITY.filter((r) => e.reasons.has(r)),
        };
      })
      .sort(
        (x, y) =>
          orderIndex.get(x.a.id)! - orderIndex.get(y.a.id)! ||
          orderIndex.get(x.b.id)! - orderIndex.get(y.b.id)!,
      );

    groups.push({
      key: sorted.map((m) => m.id).join("_"),
      reasons,
      confidence,
      clients: sorted,
      pairs,
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
