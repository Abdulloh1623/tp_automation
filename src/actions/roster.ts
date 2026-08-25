"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isUserShift, type UserShift } from "@/lib/constants";
import { tzDayKey, tzDayStartFromInput } from "@/lib/tz";

export type RosterState = { ok: boolean; error?: string };

export type RosterEntryInput = { userId: string; shift: UserShift };

/**
 * ADMIN berilgan kun (odatda ertaga) uchun kim ishlashini va qaysi smenada
 * ekanini belgilaydi. Kunlik taqsimot yadrosi (`distributeLeadsCore`) endi
 * SHU jadvaldan (`DutyDay`) operatorlarni oladi — User.shift/isActive
 * o'ziga o'zi taqsimotga ta'sir qilmaydi, faqat formada standart taklif
 * sifatida ko'rsatiladi.
 *
 * Ro'yxat har safar TO'LIQ almashtiriladi (o'sha kun uchun eski yozuvlar
 * o'chirilib, yangisi yoziladi) — istisno emas, to'liq qo'lda boshqaruv.
 */
export async function setDutyRoster(
  dateKey: string,
  entries: RosterEntryInput[],
): Promise<RosterState> {
  const g = await guardRole(["ADMIN"]);
  if (!g.ok) return { ok: false, error: g.error };

  const date = tzDayStartFromInput(dateKey);
  if (!date) return { ok: false, error: "Sana noto'g'ri" };

  const valid = await db.user.findMany({
    where: { role: "OPERATOR", id: { in: entries.map((e) => e.userId) } },
    select: { id: true },
  });
  const validIds = new Set(valid.map((u) => u.id));
  const rows = entries.filter((e) => validIds.has(e.userId) && isUserShift(e.shift));

  await db.$transaction([
    db.dutyDay.deleteMany({ where: { date } }),
    ...(rows.length
      ? [
          db.dutyDay.createMany({
            data: rows.map((r) => ({ userId: r.userId, shift: r.shift, date })),
          }),
        ]
      : []),
  ]);

  const dayCount = rows.filter((r) => r.shift === "DAY").length;
  await logAudit("Ish jadvali belgilandi", {
    entity: "DutyDay",
    detail: `${tzDayKey(date)}: ${rows.length} xodim (kunduzgi ${dayCount}, kechki ${rows.length - dayCount})`,
  });

  revalidatePath("/ish-jadvali");
  revalidatePath("/lidlar");
  return { ok: true };
}
