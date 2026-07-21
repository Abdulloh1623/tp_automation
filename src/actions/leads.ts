"use server";

import { z } from "zod";
import { addDays, startOfDay, endOfDay } from "date-fns";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { canMutateClient } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { computeNextPaymentDate } from "@/lib/billing";
import { autoEscalationTarget, escalationStagePatch, shouldEscalate } from "@/lib/escalation";

const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];
import {
  FOLLOW_UP_DAYS,
  LEAD_OUTCOME,
  LEAD_STAGE,
  MISSED_OUTCOMES,
  OUTCOME_TO_STAGE,
  type LeadOutcome,
} from "@/lib/constants";
import { isLeadOutcome, isLeadStage, noteString, safeNote } from "@/lib/validation";

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
 * Lid natijasi "Taklif" (SUGGESTION) bo'lsa — admin/menejerdagi "Takliflar"
 * bo'limiga yozuv qo'shadi (mijoz bergan taklif matni bilan). Mijozda muammo yo'q.
 */
async function autoCreateSuggestion(clientId: string, byUserId: string, body: string) {
  const trimmed = body.trim();
  // Bir katak kun davomida qayta saqlansa (izoh tahriri) dublikat yaratmaymiz —
  // bugungi taklif yozuvini yangilaymiz. Boshqa kunlik yangi taklif — alohida yozuv.
  const today = await db.suggestion.findFirst({
    where: { clientId, createdAt: { gte: startOfDay(new Date()) } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (today) {
    await db.suggestion.update({ where: { id: today.id }, data: { body: trimmed } });
  } else {
    await db.suggestion.create({
      data: { clientId, body: trimmed, createdById: byUserId },
    });
  }
  revalidatePath("/takliflar");
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
    return { error: "Mijoz topilmadi" };
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

  // Otkaz (bekor qilish) — izoh MAJBURIY (sabab tarixda qolishi shart).
  if (outcome === "REFUSED" && !parsed.data.note) {
    return { error: "Otkaz uchun izoh (sabab) majburiy" };
  }
  // Taklif — matni MAJBURIY (Takliflar bo'limiga tushadi).
  if (outcome === "SUGGESTION" && !parsed.data.note) {
    return { error: "Taklif matnini yozing" };
  }

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { error: "Lid topilmadi" };

  // Ketma-ket ko'tarilmaganlarni hisoblaymiz
  const isMissed = MISSED_OUTCOMES.includes(outcome as LeadOutcome);
  const missedCount = isMissed ? client.missedCallCount + 1 : 0;

  // 3 marta ketma-ket ko'tarilmasa — avtomatik eskalatsiyaga (29$ bo'lsa otkazga)
  const escalate = isMissed && shouldEscalate(missedCount);
  const auto = escalate
    ? autoEscalationTarget(missedCount, client.monthlyAmount, client.currency)
    : null;
  const targetStage = auto ? auto.stage : OUTCOME_TO_STAGE[outcome as LeadOutcome];

  let note = parsed.data.note ?? null;
  if (auto) {
    note = note ? `${note} · ${auto.note}` : auto.note;
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

  // Kun-yakuni maqsad bo'limni belgilab qo'yamiz (hozir ko'chmaydi). Ketma-ket
  // ko'tarilmaganlar soni saqlanadi — eskalatsiya ro'yxatida ko'rinadi (revertLead nollaydi).
  await db.client.update({
    where: { id: clientId },
    data: {
      pendingStage: targetStage,
      lastOutcome: outcome,
      lastContactedAt: new Date(),
      missedCallCount: missedCount,
    },
  });

  if (outcome === "RETURN_EQUIPMENT") {
    await autoReturnRequest(clientId, session.userId, parsed.data.note ?? null);
  }
  if (outcome === "HAS_ISSUE") {
    await autoCreateTicket(clientId, parsed.data.note ?? null);
  }
  if (outcome === "SUGGESTION") {
    await autoCreateSuggestion(clientId, session.userId, parsed.data.note ?? "");
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
    // Hal bo'lgan (obuna faol) mijozning to'lov sanasi bo'sh qolsa — shartnoma
    // sanasidan hisoblaymiz, faol mijoz hech qachon to'lov sanasisiz qolmasin.
    let paymentPatch: Date | undefined;
    switch (target) {
      case "NO_ANSWER":
        nextContactDate = addDays(today, 1); // ertaga qayta urinish
        break;
      case "LATER":
        nextContactDate = addDays(today, 2); // keyinroq
        break;
      case "FOLLOW_UP":
        nextContactDate = addDays(today, FOLLOW_UP_DAYS); // "muammo yo'q" — 4 kundan so'ng
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
        if (lead.status === "ACTIVE" && !lead.nextPaymentDate) {
          paymentPatch = computeNextPaymentDate(lead.contractDate ?? lead.createdAt);
          nextContactDate = paymentPatch;
        } else {
          nextContactDate = lead.nextPaymentDate ?? null;
        }
        break;
      default: // DEACTIVATED yoki noma'lum
        nextContactDate = null;
    }

    // Otkaz/o'chirilgan (workflow'dan chiqqan) — mijoz nofaol bo'ladi, churn
    // vaqti yoziladi va biriktiruv bo'shatiladi (moliya + qarzdorlik oqimidan chiqadi).
    const churnPatch =
      target === "REFUSED" || target === "DEACTIVATED"
        ? { status: "INACTIVE", deactivatedAt: new Date(), assignedToId: null }
        : {};

    await db.client.update({
      where: { id: lead.id },
      data: {
        stage: target,
        pendingStage: null,
        nextContactDate,
        ...churnPatch,
        ...(paymentPatch ? { nextPaymentDate: paymentPatch } : {}),
        ...escalationStagePatch(target, { stage: lead.stage, escalatedAt: lead.escalatedAt }),
      },
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
  // Otkazga (REFUSED) qo'lda ko'chirish bu yerdan taqiqlangan — otkaz uchun izoh
  // majburiy, shuning uchun u faqat izohli yo'llardan (refuseClient / lid natijasi)
  // o'tishi kerak.
  if (stage === "REFUSED") return;
  if (!(await canMutateClient(g.session, clientId))) return;
  try {
    const current = await db.client.findUnique({
      where: { id: clientId },
      select: { stage: true, escalatedAt: true },
    });
    if (!current) return;
    await db.client.update({
      where: { id: clientId },
      data: {
        stage,
        pendingStage: null,
        ...escalationStagePatch(stage, current),
      },
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
  // Otkaz (bekor qilish) — izoh MAJBURIY (sabab tarixda qolishi shart).
  if (outcome === "REFUSED" && !(note ?? "").trim()) {
    return { error: "Otkaz uchun izoh (sabab) majburiy" };
  }
  // Taklif — matni MAJBURIY (Takliflar bo'limiga tushadi).
  if (outcome === "SUGGESTION" && !(note ?? "").trim()) {
    return { error: "Taklif matnini yozing" };
  }
  if (!(await canMutateClient(session, clientId))) {
    return { error: "Mijoz topilmadi" };
  }

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const todayLog = await db.callLog.findFirst({
    where: { clientId, calledAt: { gte: dayStart, lte: dayEnd } },
    orderBy: { calledAt: "desc" },
  });
  let logId: string;
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
    logId = todayLog.id;
  } else {
    const created = await db.callLog.create({
      data: {
        clientId,
        result: outcome,
        note: note ?? null,
        operatorId: session.userId,
        calledAt: now,
      },
      select: { id: true },
    });
    logId = created.id;
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

  // 3 marta ketma-ket ko'tarilmasa — avtomatik eskalatsiyaga (yoki 29$ bo'lsa otkazga).
  const escalate = shouldEscalate(consecutiveMissed);
  let pendingStage: string;
  if (escalate) {
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { monthlyAmount: true, currency: true },
    });
    const target = autoEscalationTarget(
      consecutiveMissed,
      client?.monthlyAmount ?? 0,
      client?.currency ?? "USD",
    );
    pendingStage = target.stage;
    // Tizim izohini bugungi yozuvga qo'shamiz — tarix va eskalatsiya/otkaz
    // ro'yxatlarida "oxirgi izoh" sifatida ko'rinadi.
    const base = (note ?? "").trim();
    await db.callLog.update({
      where: { id: logId },
      data: { note: base ? `${base} · ${target.note}` : target.note },
    });
  } else {
    pendingStage = OUTCOME_TO_STAGE[outcome as LeadOutcome];
  }

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
  if (outcome === "SUGGESTION") {
    await autoCreateSuggestion(clientId, session.userId, note ?? "");
  }

  await logAudit(`Lid katak: ${LEAD_OUTCOME[outcome as LeadOutcome] ?? outcome}`, {
    entity: "Client",
    entityId: clientId,
  });
  return { pendingStage, missedCallCount: consecutiveMissed };
}

export type RevertCellState = { ok?: boolean; missedCallCount?: number; error?: string };

/**
 * Bugungi lid natijasini QAYTARISH (undo) — operator xato yoki sinov uchun natija
 * tanlab qo'ygan bo'lsa. Bugungi CallLog o'chiriladi, ketma-ket ko'tarilmaganlar
 * qayta hisoblanadi, pendingStage tozalanadi va oxirgi aloqa avvalgi (qolgan)
 * yozuvga qaytadi. Bugun avtomatik yaratilgan (hali ishlov berilmagan) taklif/
 * muammo/qaytarish yozuvi ham o'chiriladi — chunki tanlov xato edi.
 */
export async function revertLeadCell(clientId: string): Promise<RevertCellState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };
  const session = g.session;
  if (!(await canMutateClient(session, clientId))) return { error: "Mijoz topilmadi" };

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const todayRange = { gte: dayStart, lte: dayEnd };

  const todayLog = await db.callLog.findFirst({
    where: { clientId, calledAt: todayRange },
    orderBy: { calledAt: "desc" },
    select: { id: true, result: true },
  });
  if (!todayLog) return { error: "Bugun uchun qaytariladigan natija yo'q" };

  const outcome = todayLog.result;
  // Bugun avtomatik yaratilgan, hali ishlov berilmagan yon-yozuvlarni tozalash
  if (outcome === "SUGGESTION") {
    await db.suggestion.deleteMany({
      where: { clientId, status: "OPEN", createdAt: todayRange },
    });
    revalidatePath("/takliflar");
  } else if (outcome === "HAS_ISSUE") {
    await db.ticket.deleteMany({
      where: {
        clientId,
        status: "OPEN",
        assignedStaffId: null,
        assignedUstaId: null,
        createdAt: todayRange,
      },
    });
    revalidatePath("/muammolar");
  } else if (outcome === "RETURN_EQUIPMENT") {
    await db.equipmentReturnRequest.deleteMany({
      where: { clientId, status: "PENDING", createdAt: todayRange },
    });
    revalidatePath("/qaytarish");
  }

  await db.callLog.delete({ where: { id: todayLog.id } });

  // Ketma-ket ko'tarilmaganlarni qolgan tarixdan qayta hisoblaymiz
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
  const prev = logs[0] ?? null; // eng so'nggi qolgan yozuv

  await db.client.update({
    where: { id: clientId },
    data: {
      pendingStage: null,
      lastOutcome: prev?.result ?? null,
      lastContactedAt: prev?.calledAt ?? null,
      missedCallCount: consecutiveMissed,
    },
  });

  await logAudit(`Lid natijasi qaytarildi: ${LEAD_OUTCOME[outcome as LeadOutcome] ?? outcome}`, {
    entity: "Client",
    entityId: clientId,
  });
  revalidatePath("/lidlar");
  return { ok: true, missedCallCount: consecutiveMissed };
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
    return { ok: false, error: "Mijoz topilmadi" };
  }
  const trimmed = safeNote(note) ?? "";
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
        // Eskalatsiya belgilarini tozalash (mas'ul + SLA soati)
        escalatedAt: null,
        escalationStaffId: null,
        slaNotifiedAt: null,
        // Kunlik ishga qaytgani uchun qayta faollashtiramiz (churn belgisini olib tashlaymiz)
        status: "ACTIVE",
        deactivatedAt: null,
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

// Lid jadvalidagi modal uchun mijozning to'liq ma'lumoti (faqat o'qish)
export type ClientInfoData = {
  id: string;
  restaurantName: string;
  fullName: string;
  region: string | null;
  status: string;
  phone: string;
  phones: { label: string; number: string }[];
  contractNumber: string | null;
  contractDate: string | null;
  installerName: string | null;
  equipment: string | null;
  equipmentMode: string;
  monoblokCount: number;
  equipmentItems: { name: string; quantity: number; ownership: string }[];
  monthlyAmount: number;
  currency: string;
  nextPaymentDate: string | null;
  notes: string | null;
  operatorName: string | null;
  lastPayment: { amount: number; currency: string; paidAt: string } | null;
};

export type ClientInfoState =
  | { ok: true; info: ClientInfoData }
  | { ok: false; error: string };

/** Lidlar jadvalida mijoz nomiga bosilganda ko'rsatiladigan ma'lumotlar. */
export async function getClientInfo(clientId: string): Promise<ClientInfoState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { ok: false, error: g.error };
  if (!(await canMutateClient(g.session, clientId))) {
    return { ok: false, error: "Mijoz topilmadi" };
  }

  const c = await db.client.findUnique({
    where: { id: clientId },
    include: {
      phones: { orderBy: { createdAt: "asc" } },
      equipmentItems: { include: { equipmentType: { select: { name: true } } } },
      assignedTo: { select: { name: true } },
      payments: {
        orderBy: { paidAt: "desc" },
        take: 1,
        select: { amount: true, currency: true, paidAt: true },
      },
    },
  });
  if (!c) return { ok: false, error: "Mijoz topilmadi" };

  return {
    ok: true,
    info: {
      id: c.id,
      restaurantName: c.restaurantName,
      fullName: c.fullName,
      region: c.region,
      status: c.status,
      phone: c.phone,
      phones: c.phones.map((p) => ({ label: p.label, number: p.number })),
      contractNumber: c.contractNumber,
      contractDate: c.contractDate ? c.contractDate.toISOString() : null,
      installerName: c.installerName,
      equipment: c.equipment,
      equipmentMode: c.equipmentMode,
      monoblokCount: c.monoblokCount,
      equipmentItems: c.equipmentItems.map((e) => ({
        name: e.equipmentType.name,
        quantity: e.quantity,
        ownership: e.ownership,
      })),
      monthlyAmount: c.monthlyAmount,
      currency: c.currency,
      nextPaymentDate: c.nextPaymentDate ? c.nextPaymentDate.toISOString() : null,
      notes: c.notes,
      operatorName: c.assignedTo?.name ?? null,
      lastPayment: c.payments[0]
        ? {
            amount: c.payments[0].amount,
            currency: c.payments[0].currency,
            paidAt: c.payments[0].paidAt.toISOString(),
          }
        : null,
    },
  };
}

/** Qo'lda eskalatsiya — lid darhol boshliq navbatiga (ESCALATED) o'tadi. */
export async function escalateLead(
  clientId: string,
): Promise<{ ok: boolean }> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { ok: false };
  if (!(await canMutateClient(g.session, clientId))) return { ok: false };
  try {
    const current = await db.client.findUnique({
      where: { id: clientId },
      select: { stage: true, escalatedAt: true },
    });
    if (!current) return { ok: false };
    await db.client.update({
      where: { id: clientId },
      data: {
        stage: "ESCALATED",
        pendingStage: null,
        ...escalationStagePatch("ESCALATED", current),
      },
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
