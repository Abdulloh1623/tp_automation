"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type UstaState = { ok: boolean; error?: string };

async function requireMgr(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
  }
  return { ok: true, userId: session.userId };
}

function clean(v?: string): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** Viloyatlar massivini tozalab CSV va birlamchi (region) ko'rinishga keltiradi. */
function regionData(regions?: string[]): { region: string | null; regions: string | null } {
  const regs = (regions ?? []).map((r) => r.trim()).filter(Boolean);
  return { region: regs[0] ?? null, regions: regs.length ? regs.join(",") : null };
}

/** Usta qo'shish — ustalar tizimga KIRMAYDI, shuning uchun login/parol avtomatik (yaroqsiz). */
export async function createUsta(input: {
  name: string;
  regions?: string[];
  phone?: string;
}): Promise<UstaState> {
  const m = await requireMgr();
  if (!m.ok) return m;

  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Ism kiriting" };

  // Login'siz: noyob texnik username + yaroqsiz parol (INSTALLER login bloklangan)
  const username = `usta-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const passwordHash = await bcrypt.hash(`${Math.random()}${Date.now()}`, 10);

  await db.user.create({
    data: {
      name,
      username,
      passwordHash,
      role: "INSTALLER",
      ...regionData(input.regions),
      phone: clean(input.phone),
    },
  });
  await logAudit("Usta qo'shildi", { entity: "User", detail: name });
  revalidatePath("/ustalar");
  return { ok: true };
}

export async function updateUsta(
  id: string,
  input: { name: string; regions?: string[]; phone?: string },
): Promise<UstaState> {
  const m = await requireMgr();
  if (!m.ok) return m;
  if (!input.name?.trim()) return { ok: false, error: "Ism kiriting" };

  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.role !== "INSTALLER") {
    return { ok: false, error: "Usta topilmadi" };
  }

  await db.user.update({
    where: { id },
    data: {
      name: input.name.trim(),
      ...regionData(input.regions),
      phone: clean(input.phone),
    },
  });
  await logAudit("Usta tahrirlandi", { entity: "User", entityId: id });
  revalidatePath("/ustalar");
  return { ok: true };
}

export async function setUstaActive(
  id: string,
  active: boolean,
): Promise<UstaState> {
  const m = await requireMgr();
  if (!m.ok) return m;
  await db.user.update({ where: { id }, data: { isActive: active } });
  await logAudit(active ? "Usta yoqildi" : "Usta faolsizlantirildi", {
    entity: "User",
    entityId: id,
  });
  revalidatePath("/ustalar");
  return { ok: true };
}

/** Bog'liqlik bo'lmasa to'liq o'chiradi; aks holda faqat faolsizlantirishni so'raydi. */
export async function deleteUsta(id: string): Promise<UstaState> {
  const m = await requireMgr();
  if (!m.ok) return m;

  const [clients, stock, calls] = await Promise.all([
    db.client.count({ where: { assignedUstaId: id } }),
    db.inventoryStock.count({ where: { locationType: "USTA", locationId: id } }),
    db.callLog.count({ where: { operatorId: id } }),
  ]);
  if (clients > 0 || stock > 0 || calls > 0) {
    return {
      ok: false,
      error:
        "Bu ustada bog'liq ma'lumot bor (mijoz/zaxira/tarix). Faqat faolsizlantirish mumkin.",
    };
  }

  await db.user.delete({ where: { id } });
  await logAudit("Usta o'chirildi", { entity: "User", entityId: id });
  revalidatePath("/ustalar");
  return { ok: true };
}
