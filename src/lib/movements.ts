// Ombor harakatlari (EquipmentMovement) uchun yorliq yechuvchi — sahifa va eksport ishlatadi.

export type RawMovement = {
  id: string;
  createdAt: Date;
  quantity: number;
  reason: string | null;
  note: string | null;
  fromType: string | null;
  fromId: string | null;
  toType: string | null;
  toId: string | null;
  byUserId: string | null;
  equipmentTypeId: string;
};

export type MovementRow = {
  id: string;
  date: string; // ISO
  typeName: string;
  quantity: number;
  from: string;
  to: string;
  reason: string;
  user: string;
  note: string | null;
};

/** Harakatlar jurnalida filtrlash uchun sabablar. */
export const MOVEMENT_REASONS = [
  "Kirim",
  "Ustaga taqsimot",
  "Ustadan qaytarish",
  "Inventarizatsiya",
  "Brak",
  "Mijozga ijara",
  "Mijozga sotuv",
  "Uskuna qaytarildi (mijozdan)",
] as const;

function locLabel(
  type: string | null,
  id: string | null,
  userName: Map<string, string>,
  clientName: Map<string, string>,
): string {
  if (!type) return "—";
  if (type === "WAREHOUSE") return "Ombor";
  if (type === "BRAK") return "Brak";
  if (type === "USTA") return id ? (userName.get(id) ?? "Usta") : "Usta";
  if (type === "CLIENT") return id ? (clientName.get(id) ?? "Mijoz") : "Mijoz";
  return type;
}

export function resolveMovements(
  movements: RawMovement[],
  typeName: Map<string, string>,
  userName: Map<string, string>,
  clientName: Map<string, string>,
): MovementRow[] {
  return movements.map((m) => ({
    id: m.id,
    date: m.createdAt.toISOString(),
    typeName: typeName.get(m.equipmentTypeId) ?? "—",
    quantity: m.quantity,
    from: locLabel(m.fromType, m.fromId, userName, clientName),
    to: locLabel(m.toType, m.toId, userName, clientName),
    reason: m.reason ?? "—",
    user: m.byUserId ? (userName.get(m.byUserId) ?? "—") : "—",
    note: m.note,
  }));
}
