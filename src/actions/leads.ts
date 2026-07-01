"use server";

import { z } from "zod";
import { addDays, startOfDay, endOfDay } from "date-fns";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { canMutateClient } from "@/lib/access";
import { logAudit } from "@/lib/audit";

const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];
import {
  ESCALATION_THRESHOLD,
  LEAD_OUTCOME,
  LEAD_STAGE,
  MISSED_OUTCOMES,
  OUTCOME_TO_STAGE,
  type LeadOutcome,
} from "@/lib/constants";
import { isLeadOutcome, isLeadStage, noteString } from "@/lib/validation";

function s(v: FormDataEntryValue | null): string | undefined {
  const str = typeof v === "string" ? v.trim() : "";
  return str === "" ? undefined : str;
}

const outcomeSchema = z.object({
  outcome: z
    .string()
    .min(1, "Natijani tanlang")
    .refine(isLeadOutcome, "Noto'g'ri natija"),
  note: noteString.optional(),
});

export type LeadOutcomeState = { error?: string };

/**
 * Lid natijasi "Uskuna qaytarish kerak" (RETURN_EQUIPMENT) bo'lsa — boshliqning
 * "Qaytariladigan uskunalar" navbatiga PENDING ariza qo'shadi (ochiq ariza bo'lmasa).
 */
async function autoReturnRequest(clientId: string, byUserId: string, note: string | null) {
  const open = await db.equipmentReturnRequest.findFirst({
    where: { clientId, status: { in: ["PENDING", "APPROVED"] } },
    select: { id: true },
  });
  if (open) return;
  await db.equipmentReturnRequest.create({
    data: {
      clientId,
      byUserId,
      note: note?.trim() || "Uskuna qaytarish kerak (operator)",
      status: "PENDING",
    },
  });
  revalidatePath("/qaytarish");
}

/**
 * Lid natijasi "Muammo bor" (HAS_ISSUE) bo'lsa — avtomatik Muammolar bo'limiga
 * ticket ochadi (yozilgan izoh bilan). Ochiq ticket bo'lsa dublikat yaratmaydi.
 * Boshliq keyin ticketni integratorga (ustaga) biriktiradi.
 */
async function autoCreateTicket(clientId: string, note: string | null) {
  const open = await db.ticket.findFirst({
    where: { clientId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    select: { id: true },
  });
  if (open) return;
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { assignedToId: true },
  });
  const title = note?.trim() ? note.trim().slice(0, 300) : "Operator bildirgan muammo";
  await db.ticket.create({
    data: {
      clientId,
      title,
      type: "TECHNICAL",
      priority: "MEDIUM",
      status: "OPEN",
      assignedToId: client?.assignedToId ?? null,
    },
  });
  revalidatePath("/muammolar");
}

/**
 * Xodim lid bilan gaplashgach natija + izoh yozadi.
 * CallLog (tarix) yaratiladi va lidning `pendingStage`i belgilanadi —
 * lid kun yakunida (`finishDay`) shu bo'limga ko'chadi.
 */
export async function recordLeadOutcome(
  clientId: string,
  _prev: LeadOutcomeState,
  formData: FormData,
): Promise<LeadOutcomeState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };
  const session = g.session;
  if (!(await canMutateClient(session, clientId))) {
    return { error: "Bu mijoz sizga biriktirilmagan" };
  }

  const parsed = outcomeSchema.safeParse({
    outcome: s(formData.get("outcome")),
    note: s(formData.get("note")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Maʼlumotlar noto'g'ri" };
  }

  // outcome validligi sxemada (refine isLeadOutcome) kafolatlangan
  const { outcome } = parsed.data;

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { error: "Lid topilmadi" };

  // Ketma-ket ko'tarilmaganlarni hisoblaymiz
  const isMissed = MISSED_OUTCOMES.includes(outcome as LeadOutcome);
  const missedCount = isMissed ? client.missedCallCount + 1 : 0;

  // 3 tadan oshsa — avtomatik ustaga (FORWARDED) yo'naltiriladi
  const escalate = isMissed && missedCount > ESCALATION_THRESHOLD;
  const targetStage = escalate
    ? "FORWARDED"
    : OUTCOME_TO_STAGE[outcome as LeadOutcome];

  let note = parsed.data.note ?? null;
  if (escalate) {
    const auto = `${missedCount} marta ketma-ket ko'tarilmadi — avtomatik ustaga yo'naltirildi`;
    note = note ? `${note} · ${auto}` : auto;
  }

  // Tarix uchun CallLog (mavjud model qayta ishlatiladi). Keyingi sana
  // operator tomonidan emas, tizim (finishDay) tomonidan belgilanadi.
  await db.callLog.create({
    data: {
      clientId,
      result: outcome,
      note,
      operatorId: session.userId,
      nextFollowUpDate: null,
    },
  });

  // Kun-yakuni maqsad bo'limni belgilab qo'yamiz (hozir ko'chmaydi).
  // Yo'naltirilgandan keyin hisoblagich nollanadi.
  await db.client.update({
    where: { id: clientId },
    data: {
      pendingStage: targetStage,
      lastOutcome: outcome,
      lastContactedAt: new Date(),
      missedCallCount: escalate ? 0 : missedCount,
    },
  });

  if (outcome === "RETURN_EQUIPMENT") {
    await autoReturnRequest(clientId, session.userId, parsed.data.note ?? null);
  }
  if (outcome === "HAS_ISSUE") {
    await autoCreateTicket(clientId, parsed.data.note ?? null);
  }

  await logAudit(`Lid natijasi: ${LEAD_OUTCOME[outcome as LeadOutcome] ?? outcome}`, {
    entity: "Client",
    entityId: clientId,
    detail: client.restaurantName,
  });
  revalidatePath("/lidlar");
  revalidatePath(`/mijozlar/${clientId}`);
  return {};
}

export type FinishDayState = { moved?: number; error?: string };

/**
 * "Kunni yakunlash" — bugun aloqa qilingan (pendingStage belgilangan) lidlar
 * statusiga ko'ra yangi bo'limga ko'chiriladi va keyingi aloqa sanasi qo'yiladi.
 */
export async function finishDay(
  _prev: FinishDayState,
  _formData: FormData,
): Promise<FinishDayState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };
  const session = g.session;

  const leads = await db.client.findMany({
    where: { assignedToId: session.userId, pendingStage: { not: null } },
  });

  const today = new Date();

  for (const lead of leads) {
    const target = lead.pendingStage as string;

    // Keyingi aloqa sanasini tizim holatga qarab belgilaydi
    let nextContactDate: Date | null;
    switch (target) {
      case "NO_ANSWER":
        nextContactDate = addDays(today, 1); // ertaga qayta urinish
        break;
      case "LATER":
        nextContactDate = addDays(today, 2); // keyinroq
        break;
      case "AWAITING_PAYMENT":
        nextContactDate =
          lead.lastOutcome === "WILL_PAY_TOMORROW"
            ? addDays(today, 1) // ertaga to'lov qiladi
            : lead.nextPaymentDate ?? addDays(today, 3);
        break;
      case "FORWARDED":
        nextContactDate = addDays(today, 1); // usta tez ko'rib chiqsin
        break;
      case "RESOLVED":
        nextContactDate = lead.nextPaymentDate ?? null;
        break;
      default: // DEACTIVATED yoki noma'lum
        nextContactDate = null;
    }

    await db.client.update({
      where: { id: lead.id },
      data: { stage: target, pendingStage: null, nextContactDate },
    });
  }

  await logAudit("Kun yakunlandi", {
    entity: "User",
    detail: `${leads.length} lid ko'chirildi`,
  });
  revalidatePath("/lidlar");
  revalidatePath("/");
  return { moved: leads.length };
}

/** Lidni qo'lda boshqa bo'limga ko'chirish (override). */
export async function moveLeadStage(
  clientId: string,
  stage: string,
  _formData: FormData,
): Promise<void> {
  const g = await guardRole(STAFF);
  if (!g.ok) return;
  if (!isLeadStage(stage)) return;
  if (!(await canMutateClient(g.session, clientId))) return;
  try {
    await db.client.update({
      where: { id: clientId },
      data: { stage, pendingStage: null },
    });
    await logAudit(`Lid bo'lim: ${LEAD_STAGE[stage as keyof typeof LEAD_STAGE] ?? stage}`, {
      entity: "Client",
      entityId: clientId,
    });
    revalidatePath("/lidlar");
  } catch {
    // lid topilmadi — jimgina o'tkazib yuboramiz
  }
}

export type SaveCellState = {
  pendingStage?: string;
  missedCallCount?: number;
  error?: string;
};

/**
 * Jadval "Bugun" katagini saqlash: bir mijoz uchun bugungi CallLog upsert
 * qilinadi, ketma-ket ko'tarilmaganlar tarixdan qayta hisoblanadi va
 * pendingStage belgilanadi (3+ ko'tarilmasa ESCALATED). Avto-saqlash uchun
 * revalidate qilmaydi — klient javobdan local holatni yangilaydi.
 */
export async function saveLeadCell(
  clientId: string,
  outcome: string,
  note: string | null,
): Promise<SaveCellState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };
  const session = g.session;
  if (!isLeadOutcome(outcome)) return { error: "Noto'g'ri natija" };
  if (!(await canMutateClient(session, clientId))) {
    return { error: "Bu mijoz sizga biriktirilmagan" };
  }

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const todayLog = await db.callLog.findFirst({
    where: { clientId, calledAt: { gte: dayStart, lte: dayEnd } },
    orderBy: { calledAt: "desc" },
  });
  if (todayLog) {
    await db.callLog.update({
      where: { id: todayLog.id },
      data: {
        result: outcome,
        note: note ?? null,
        operatorId: session.userId,
        calledAt: now,
      },
    });
  } else {
    await db.callLog.create({
      data: {
        clientId,
        result: outcome,
        note: note ?? null,
        operatorId: session.userId,
        calledAt: now,
      },
    });
  }

  // Ketma-ket ko'tarilmaganlarni kun bo'yicha tarixdan qayta hisoblaymiz
  const logs = await db.callLog.findMany({
    where: { clientId },
    orderBy: { calledAt: "desc" },
    take: 90,
    select: { calledAt: true, result: true },
  });
  const seenDays = new Set<string>();
  let consecutiveMissed = 0;
  for (const l of logs) {
    const key = l.calledAt.toISOString().slice(0, 10);
    if (seenDays.has(key)) continue;
    seenDays.add(key);
    if (MISSED_OUTCOMES.includes(l.result as LeadOutcome)) consecutiveMissed += 1;
    else break;
  }

  const escalate = consecutiveMissed > ESCALATION_THRESHOLD;
  const pendingStage = escalate
    ? "ESCALATED"
    : OUTCOME_TO_STAGE[outcome as LeadOutcome];

  await db.client.update({
    where: { id: clientId },
    data: {
      pendingStage,
      lastOutcome: outcome,
      lastContactedAt: now,
      missedCallCount: consecutiveMissed,
    },
  });

  if (outcome === "RETURN_EQUIPMENT") {
    await autoReturnRequest(clientId, session.userId, note);
  }
  if (outcome === "HAS_ISSUE") {
    await autoCreateTicket(clientId, note);
  }

  await logAudit(`Lid katak: ${LEAD_OUTCOME[outcome as LeadOutcome] ?? outcome}`, {
    entity: "Client",
    entityId: clientId,
  });
  return { pendingStage, missedCallCount: consecutiveMissed };
}

export type SpecialNoteState = {
  ok?: boolean;
  error?: string;
  specialNote?: string | null;
  specialNoteBy?: string | null;
  specialNoteAt?: string | null;
};

/** Maxsus (doimiy) izohni saqlash/o'chirish (bo'sh bo'lsa o'chadi). */
export async function setSpecialNote(
  clientId: string,
  note: string,
): Promise<SpecialNoteState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { ok: false, error: g.error };
  const session = g.session;
  if (!(await canMutateClient(session, clientId))) {
    return { ok: false, error: "Bu mijoz sizga biriktirilmagan" };
  }
  const trimmed = (note ?? "").trim();
  const empty = trimmed === "";

  const updated = await db.client.update({
    where: { id: clientId },
    data: {
      specialNote: empty ? null : trimmed,
      specialNoteById: empty ? null : session.userId,
      specialNoteAt: empty ? null : new Date(),
    },
  });

  await logAudit(empty ? "Maxsus izoh o'chirildi" : "Maxsus izoh saqlandi", {
    entity: "Client",
    entityId: clientId,
  });
  return {
    ok: true,
    specialNote: updated.specialNote,
    specialNoteBy: empty ? null : session.name,
    specialNoteAt: updated.specialNoteAt
      ? updated.specialNoteAt.toISOString()
      : null,
  };
}

/**
 * Lidni orqaga qaytarish — noto'g'ri (texnik nosozlik yoki bilmasdan) boshliqqa
 * yo'naltirilgan yoki "muammo bor" deb belgilangan lidni kunlik ishga qaytaradi.
 * Usta biriktiruvi va eskalatsiya holatlari tozalanadi. Faqat boshliq/admin.
 */
export async function revertLead(
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return { ok: false, error: g.error };
  try {
    await db.client.update({
      where: { id: clientId },
      data: {
        stage: "NEW",
        pendingStage: null,
        assignedUstaId: null,
        ustaStatus: null,
        missedCallCount: 0,
        nextContactDate: new Date(), // bugungi kunlik ro'yxatga qaytadi
      },
    });
    await logAudit("Lid orqaga qaytarildi (kunlik ishga)", {
      entity: "Client",
      entityId: clientId,
    });
    revalidatePath("/eskalatsiya");
    revalidatePath("/lidlar");
  } catch {
    return { ok: false, error: "Xatolik" };
  }
  return { ok: true };
}

/** Qo'lda eskalatsiya — lid darhol boshliq navbatiga (ESCALATED) o'tadi. */
export async function escalateLead(
  clientId: string,
): Promise<{ ok: boolean }> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { ok: false };
  if (!(await canMutateClient(g.session, clientId))) return { ok: false };
  try {
    await db.client.update({
      where: { id: clientId },
      data: { stage: "ESCALATED", pendingStage: null },
    });
    await logAudit("Boshliqqa eskalatsiya (qo'lda)", {
      entity: "Client",
      entityId: clientId,
    });
  } catch {
    return { ok: false };
  }
  return { ok: true };
}
