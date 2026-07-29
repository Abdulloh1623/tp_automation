"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole, requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isDutyRotationDay } from "@/lib/shift";
import { startOfTzDay } from "@/lib/tz";
import {
  ACTIVE_STAGES,
  isLeadProfileId,
  leadProfileLabel,
  type LeadProfileId,
} from "@/lib/constants";
import { distributeLeadsCore } from "@/lib/leads-distribution";
import { getActiveLeadProfile, setLeadProfile } from "@/lib/settings";

export type DistributeState = {
  ok?: boolean;
  assigned?: number;
  operators?: number;
  kept?: number;
  profileLabel?: string;
  error?: string;
};

export type FocusState = { ok: boolean; error?: string };

export type DutyState = { ok: boolean; assigned?: number; operators?: number; error?: string };

/**
 * Navbat kuni (yakshanba) "Bugun ishdaman" — operatorning o'zi ishga chiqqanini
 * belgilaydi va kunlik ro'yxatni O'SHA KUNI chiqqanlarga bo'lib beradi.
 *
 * Nega tugma: dushanba–shanba jadval qat'iy va taqsimot cron bo'yicha o'zi
 * ketadi, yakshanbada esa jamoa navbatni o'zaro kelishadi — tizim kim ishlashini
 * oldindan bila olmaydi. Cron o'sha kuni ishlamaydi (`scripts/bot.ts`), aks holda
 * ro'yxat ishga chiqmaganlarga ham bo'linib, ulushi kun bo'yi o'lik qolardi.
 *
 * Ikkinchi operator keyinroq chiqsa — tugmani u ham bosadi va taqsimot qayta
 * ishlaydi: bugun allaqachon ishlangan lidlar egasida qoladi (yadro shuni
 * kafolatlaydi), qolgani ikkiga bo'linadi.
 */
export async function checkInDuty(): Promise<DutyState> {
  const session = await requireSession();
  if (session.role !== "OPERATOR") {
    return { ok: false, error: "Faqat operator ishga chiqishini belgilaydi" };
  }
  if (!isDutyRotationDay()) {
    return { ok: false, error: "Bugun navbat kuni emas — ro'yxat jadval bo'yicha taqsimlanadi" };
  }

  const date = startOfTzDay(0);
  await db.dutyDay.upsert({
    where: { userId_date: { userId: session.userId, date } },
    create: { userId: session.userId, date },
    update: {},
  });

  // Bugun chiqqanlarning HAMMASI — ro'yxat ular orasida bo'linadi.
  const onDuty = await db.dutyDay.findMany({
    where: { date },
    select: { userId: true },
  });

  const res = await distributeLeadsCore(
    undefined,
    onDuty.map((d) => d.userId),
  );
  if (res.error) return { ok: false, error: res.error };

  await logAudit("Navbat kuni: ishga chiqdi", {
    entity: "User",
    entityId: session.userId,
    detail: `${session.name} · ${res.assigned} lid → ${res.operators} operator`,
  });

  revalidatePath("/lidlar");
  revalidatePath("/analitika");
  return { ok: true, assigned: res.assigned, operators: res.operators };
}

export type ReleaseState = { ok: boolean; released?: number; error?: string };

/**
 * Xodim ishga kelmaganda — uning bugungi (faol) lidlarini biriktirishdan bo'shatadi
 * (`assignedToId = null`). Lidlar "biriktirilmagan" holatga qaytadi; boshliq ularni
 * boshqa operatorga (`/mijozlar` ommaviy biriktirish) berishi yoki keyingi taqsimot
 * olishi mumkin. Faqat ADMIN/MANAGER.
 */
export async function releaseOperatorLeads(
  operatorId: string,
): Promise<ReleaseState> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return { ok: false, error: g.error };
  if (!operatorId) return { ok: false, error: "Operator tanlanmadi" };

  const op = await db.user.findUnique({
    where: { id: operatorId },
    select: { name: true },
  });
  if (!op) return { ok: false, error: "Operator topilmadi" };

  const res = await db.client.updateMany({
    where: {
      assignedToId: operatorId,
      status: "ACTIVE",
      stage: { in: ACTIVE_STAGES as unknown as string[] },
    },
    data: { assignedToId: null },
  });

  await logAudit("Operator lidlari bo'shatildi (xodim kelmadi)", {
    entity: "User",
    entityId: operatorId,
    detail: `${op.name}: ${res.count} lid biriktirishdan olindi`,
  });

  revalidatePath("/lidlar");
  revalidatePath("/mijozlar");
  revalidatePath("/analitika");
  return { ok: true, released: res.count };
}

/** Kunlik random taqsimot (ADMIN/MANAGER qo'lda; cron ham yadroni to'g'ridan chaqiradi). */
export async function redistributeLeads(
  _prev?: DistributeState,
  _formData?: FormData,
): Promise<DistributeState> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return { error: g.error };

  const res = await distributeLeadsCore();
  if (res.error) return { error: res.error };

  revalidatePath("/lidlar");
  revalidatePath("/mijozlar");
  return {
    ok: true,
    assigned: res.assigned,
    operators: res.operators,
    kept: res.kept,
    profileLabel: res.profileLabel,
  };
}

/**
 * Kunlik fokusni (lid ustuvorlik profilini) belgilaydi. Faqat ADMIN — bu
 * butun jamoaning kunlik ish tartibini o'zgartiradi.
 *
 * `todayOnly` — faqat bugungi kunga; ertaga doimiy profil qaytadi. Profil
 * o'zgarishi keyingi taqsimotdan (cron 08:00 yoki qo'lda "Qayta taqsimla")
 * kuchga kiradi — bugun allaqachon ishlangan lidlar egasida qoladi.
 */
export async function setLeadFocus(
  profile: string,
  todayOnly: boolean,
): Promise<FocusState> {
  const g = await guardRole(["ADMIN"]);
  if (!g.ok) return { ok: false, error: g.error };
  if (!isLeadProfileId(profile)) return { ok: false, error: "Noma'lum fokus profili" };

  const before = await getActiveLeadProfile();
  await setLeadProfile(profile as LeadProfileId, todayOnly);

  await logAudit("Kunlik fokus o'zgartirildi", {
    entity: "AppSetting",
    detail:
      `${leadProfileLabel(before.id)} → ${leadProfileLabel(profile)}` +
      (todayOnly ? " (faqat bugunga)" : " (doimiy)"),
  });

  revalidatePath("/lidlar");
  revalidatePath("/analitika");
  return { ok: true };
}
