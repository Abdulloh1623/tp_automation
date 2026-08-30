"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { canMutateClient } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import {
  clientAppVersionLabel,
  isClientAppVersion,
  TICKET_STATUS,
} from "@/lib/constants";
import {
  ticketTypeEnum,
  ticketPriorityEnum,
  isTicketStatus,
  toFieldErrors,
  safeNote,
} from "@/lib/validation";

const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];

/**
 * Ticket RESOLVED bo'lganda chaqiriladi. Muammo ochiq bo'lgan mijoz (`stage:
 * "ISSUE_OPEN"`) kunlik qo'ng'iroq ro'yxatida ko'rinmaydi (`ACTIVE_STAGES`
 * dan chiqarilgan) — shu ticket mijozning OXIRGI ochiq ticketi bo'lsa, mijoz
 * normal tsiklga qaytishi uchun bu yerda qaytariladi (eskalatsiyaning
 * `resolveEscalation`/`updateUstaStatus` bilan bir xil naqsh). Aks holda
 * ticket yopilgach ham mijoz abadiy ro'yxatdan tashqarida qolib ketardi.
 */
async function releaseIssueOpenIfLastTicket(clientId: string): Promise<void> {
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { stage: true, nextPaymentDate: true },
  });
  if (!client || client.stage !== "ISSUE_OPEN") return;

  const stillOpen = await db.ticket.count({
    where: { clientId, status: { not: "RESOLVED" } },
  });
  if (stillOpen > 0) return;

  await db.client.update({
    where: { id: clientId },
    data: {
      stage: "RESOLVED",
      nextContactDate: client.nextPaymentDate ?? null,
    },
  });
}

function s(v: FormDataEntryValue | null): string | undefined {
  const str = typeof v === "string" ? v.trim() : "";
  return str === "" ? undefined : str;
}

const ticketSchema = z.object({
  clientId: z.string().min(1, "Mijoz tanlanmagan"),
  title: z
    .string()
    .min(1, "Muammo sarlavhasini kiriting")
    .max(300, "Sarlavha juda uzun"),
  type: ticketTypeEnum.default("TECHNICAL"),
  priority: ticketPriorityEnum.default("MEDIUM"),
});

export type TicketFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

function revalidateTicket(clientId: string) {
  revalidatePath(`/mijozlar/${clientId}`);
  revalidatePath("/muammolar");
  revalidatePath("/");
}

export async function createTicket(
  _prev: TicketFormState,
  formData: FormData,
): Promise<TicketFormState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };
  const session = g.session;

  const parsed = ticketSchema.safeParse({
    clientId: s(formData.get("clientId")),
    title: s(formData.get("title")),
    type: s(formData.get("type")) ?? "TECHNICAL",
    priority: s(formData.get("priority")) ?? "MEDIUM",
  });
  if (!parsed.success) {
    return {
      error: "Maʼlumotlarni tekshiring",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const client = await db.client.findUnique({
    where: { id: parsed.data.clientId },
    select: { id: true, assignedToId: true },
  });
  if (!client) return { error: "Mijoz topilmadi" };
  if (!(await canMutateClient(session, client.id))) {
    return { error: "Mijoz topilmadi" };
  }

  await db.ticket.create({
    data: {
      clientId: client.id,
      title: parsed.data.title,
      type: parsed.data.type,
      priority: parsed.data.priority,
      status: "OPEN",
      assignedToId: client.assignedToId ?? session.userId,
    },
  });
  // Muammo bo'limiga o'tkazilgan sana qo'ng'iroqlar tarixida ham qolsin
  // (operator lid natijasidan ochgan ticket bunga saveLeadCell'da allaqachon ega).
  await db.callLog.create({
    data: {
      clientId: client.id,
      result: "HAS_ISSUE",
      note: parsed.data.title,
      operatorId: session.userId,
    },
  });

  await logAudit("Muammo yaratildi", {
    entity: "Ticket",
    entityId: client.id,
    detail: parsed.data.title,
  });
  revalidateTicket(client.id);
  return { ok: true };
}

/** Ticket holatini o'zgartirish. Form action sifatida: bind(null, id, status). */
export async function setTicketStatus(
  ticketId: string,
  status: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guardRole([...STAFF, "INSTALLER"]);
  if (!g.ok) return { ok: false, error: g.error };

  // status faqat ruxsat etilgan qiymatlardan biri bo'lishi shart
  // (`in` prototip kalitlarini ham true qaytaradi — enum predikat ishlatamiz)
  if (!isTicketStatus(status)) return { ok: false, error: "Noto'g'ri holat" };

  const owner = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { clientId: true, assignedUstaId: true },
  });
  if (!owner) return { ok: false, error: "Muammo topilmadi" };

  // Egalik: OPERATOR faqat o'z mijozining muammosini, usta faqat o'ziga
  // biriktirilgan muammoni o'zgartira oladi (canMutateClient INSTALLER'ni
  // umuman mijoz darajasida yozishga ruxsat bermaydi — shu bois alohida).
  if (g.session.role === "INSTALLER") {
    if (owner.assignedUstaId !== g.session.userId) {
      return { ok: false, error: "Ruxsat yo'q" };
    }
  } else if (!(await canMutateClient(g.session, owner.clientId))) {
    return { ok: false, error: "Ruxsat yo'q" };
  }

  // Yechim izohi (RESOLVED) va qayta ochish izohi (OPEN) — ikkalasi ham
  // bo'lim o'tishi bo'lgani uchun MAJBURIY. "Jarayonga olish" (IN_PROGRESS)
  // — bo'lim ichidagi belgilar (tab o'zgarmaydi), izohsiz qoladi.
  const note = s(formData.get("resolutionNote")) ?? null;
  if ((status === "RESOLVED" || status === "OPEN") && !note) {
    return { ok: false, error: "Izoh majburiy" };
  }
  const data = {
    status,
    resolvedAt: status === "RESOLVED" ? new Date() : null,
    // RESOLVED bo'lmasa (qayta ochilganda) eski yechim izohi tozalanadi
    resolutionNote: status === "RESOLVED" ? note : null,
  };

  try {
    const ticket = await db.ticket.update({ where: { id: ticketId }, data });
    // Bo'lim ichidagi holat o'zgarishi tarixda (qo'ng'iroqlar jurnali) qolsin.
    await db.callLog.create({
      data: {
        clientId: ticket.clientId,
        result:
          status === "RESOLVED"
            ? "RESOLVED"
            : status === "IN_PROGRESS"
              ? "TICKET_IN_PROGRESS"
              : "TICKET_REOPENED",
        note: status === "IN_PROGRESS" ? null : note,
        operatorId: g.session.userId,
      },
    });
    if (status === "RESOLVED") {
      await releaseIssueOpenIfLastTicket(ticket.clientId);
    }
    await logAudit(
      `Muammo holati: ${TICKET_STATUS[status as keyof typeof TICKET_STATUS] ?? status}`,
      {
        entity: "Ticket",
        entityId: ticketId,
      },
    );
    revalidateTicket(ticket.clientId);
    return { ok: true };
  } catch {
    // mavjud bo'lmagan ticketId
    return { ok: false, error: "Xatolik" };
  }
}

/**
 * Kanban'dagi "Hal bo'lmadi" ustuni (hozircha "Yangi versiya" UI'sida
 * ishlatiladi) — `status`dan MUSTAQIL bayroq (Ochiq/Jarayonda bosqichini
 * yo'qotmaslik uchun). Izoh MAJBURIY.
 */
export async function blockTicket(
  ticketId: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guardRole([...STAFF, "INSTALLER"]);
  if (!g.ok) return { ok: false, error: g.error };

  const noteText = safeNote(note);
  if (!noteText) return { ok: false, error: "Izoh majburiy" };

  const owner = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { clientId: true, assignedUstaId: true, status: true },
  });
  if (!owner) return { ok: false, error: "Muammo topilmadi" };
  if (owner.status === "RESOLVED")
    return { ok: false, error: "Muammo allaqachon hal qilingan" };

  if (g.session.role === "INSTALLER") {
    if (owner.assignedUstaId !== g.session.userId)
      return { ok: false, error: "Ruxsat yo'q" };
  } else if (!(await canMutateClient(g.session, owner.clientId))) {
    return { ok: false, error: "Ruxsat yo'q" };
  }

  await db.ticket.update({
    where: { id: ticketId },
    data: { blocked: true, blockedNote: noteText, blockedAt: new Date() },
  });
  await db.callLog.create({
    data: {
      clientId: owner.clientId,
      result: "TICKET_BLOCKED",
      note: noteText,
      operatorId: g.session.userId,
    },
  });
  await logAudit("Muammo: Hal bo'lmadi", {
    entity: "Ticket",
    entityId: ticketId,
  });
  revalidateTicket(owner.clientId);
  return { ok: true };
}

/** "Hal bo'lmadi"dan qaytarish — ticket o'zining haqiqiy `status`iga qaytadi. Izoh shart emas. */
export async function unblockTicket(
  ticketId: string,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guardRole([...STAFF, "INSTALLER"]);
  if (!g.ok) return { ok: false, error: g.error };

  const owner = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { clientId: true, assignedUstaId: true },
  });
  if (!owner) return { ok: false, error: "Muammo topilmadi" };

  if (g.session.role === "INSTALLER") {
    if (owner.assignedUstaId !== g.session.userId)
      return { ok: false, error: "Ruxsat yo'q" };
  } else if (!(await canMutateClient(g.session, owner.clientId))) {
    return { ok: false, error: "Ruxsat yo'q" };
  }

  await db.ticket.update({
    where: { id: ticketId },
    data: { blocked: false, blockedNote: null, blockedAt: null },
  });
  await db.callLog.create({
    data: {
      clientId: owner.clientId,
      result: "TICKET_UNBLOCKED",
      operatorId: g.session.userId,
    },
  });
  revalidateTicket(owner.clientId);
  return { ok: true };
}

/**
 * "Yangi versiya" so'rovini yakunlash — mijoz dasturi haqiqatan yangilangan
 * versiyani belgilaydi (`Client.appVersion`) VA ticketni RESOLVED qiladi
 * bitta amalda. Faqat VERSION_UPDATE turidagi ticketlar uchun — bosqichlar:
 * Yangi → Biriktirildi (xodim YOKI usta, `VersionAssigneeControl`) → Versiya
 * yangilandi. Mas'ul usta bo'lsa, usta o'zi ham yakunlay oladi (o'ziga
 * biriktirilganini `assignedUstaId` orqali tekshiradi — `setTicketStatus`
 * bilan bir xil naqsh).
 */
export async function resolveVersionTicket(
  ticketId: string,
  version: string,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guardRole([...STAFF, "INSTALLER"]);
  if (!g.ok) return { ok: false, error: g.error };
  if (!isClientAppVersion(version))
    return { ok: false, error: "Versiyani tanlang" };

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { clientId: true, type: true, assignedUstaId: true },
  });
  if (!ticket) return { ok: false, error: "Muammo topilmadi" };
  if (ticket.type !== "VERSION_UPDATE") {
    return { ok: false, error: "Bu amal faqat versiya so'rovlari uchun" };
  }
  if (g.session.role === "INSTALLER") {
    if (ticket.assignedUstaId !== g.session.userId) {
      return { ok: false, error: "Ruxsat yo'q" };
    }
  } else if (!(await canMutateClient(g.session, ticket.clientId))) {
    return { ok: false, error: "Ruxsat yo'q" };
  }

  const label = clientAppVersionLabel(version);
  const resolutionNote = `Versiya yangilandi: ${label}`;
  await db.$transaction([
    db.ticket.update({
      where: { id: ticketId },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolutionNote },
    }),
    db.client.update({
      where: { id: ticket.clientId },
      data: { appVersion: version },
    }),
  ]);
  await db.callLog.create({
    data: {
      clientId: ticket.clientId,
      result: "RESOLVED",
      note: resolutionNote,
      operatorId: g.session.userId,
    },
  });
  await releaseIssueOpenIfLastTicket(ticket.clientId);
  await logAudit(resolutionNote, { entity: "Ticket", entityId: ticketId });
  revalidateTicket(ticket.clientId);
  revalidatePath("/mijozlar");
  revalidatePath("/lidlar");
  return { ok: true };
}

/**
 * Muammoni "xato ochilgan" deb rad etish (tez yopish) — faqat boshliq/admin.
 * Operator lid natijasini xato tanlab (yoki qo'lda) ochib qo'ygan muammoni
 * boshliq bir bosishda yopadi: RESOLVED holatiga o'tadi, yechim izohida rad
 * sababi qoladi. Sxemada alohida "rad etilgan" holat yo'q — RESOLVED + izoh.
 * Izoh (nima uchun xato) MAJBURIY.
 */
export async function dismissTicket(
  ticketId: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return { ok: false, error: g.error };
  const noteText = note.trim();
  if (!noteText) return { ok: false, error: "Izoh majburiy" };

  try {
    const resolutionNote = `Xato ochilgan (rad etildi): ${noteText}`;
    const ticket = await db.ticket.update({
      where: { id: ticketId },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolutionNote,
      },
      select: { clientId: true, title: true },
    });
    await db.callLog.create({
      data: {
        clientId: ticket.clientId,
        result: "TICKET_DISMISSED",
        note: noteText,
        operatorId: g.session.userId,
      },
    });
    await releaseIssueOpenIfLastTicket(ticket.clientId);
    await logAudit("Muammo rad etildi (xato ochilgan)", {
      entity: "Ticket",
      entityId: ticketId,
      detail: ticket.title,
    });
    revalidateTicket(ticket.clientId);
    return { ok: true };
  } catch {
    return { ok: false, error: "Muammo topilmadi" };
  }
}

// XODIM (ofis xodimi) sifatida mas'ul qilib biriktirilishi mumkin bo'lgan rollar
const ASSIGNABLE_STAFF_ROLES = ["ADMIN", "MANAGER", "OPERATOR"];

// Biriktirish izohini tozalaydi: trim + 500 belgigacha; bo'sh bo'lsa null.
function assignNote(note?: string): string | null {
  const t = typeof note === "string" ? note.trim() : "";
  return t ? t.slice(0, 500) : null;
}

/** OPEN muammoni biriktirilganda "Jarayonda"ga o'tkazadi (boshqa holatga tegmaydi). */
function progressIfOpen(status: string): "IN_PROGRESS" | undefined {
  return status === "OPEN" ? "IN_PROGRESS" : undefined;
}

/**
 * Muammoga mas'ul TP xodimini biriktirish/olib tashlash — faqat boshliq/admin.
 * Mas'ul xodim jarayonni to'liq nazorat qilib yakunlaydi (usta bilan birga
 * bo'lishi mumkin — ular bir-birini almashtirmaydi). `staffId: null` — olib
 * tashlaydi (izoh talab qilinmaydi). Biriktirishda izoh MAJBURIY.
 */
export async function assignTicketStaff(
  ticketId: string,
  staffId: string | null,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return { ok: false, error: g.error };

  if (staffId && !assignNote(note)) {
    return { ok: false, error: "Izoh majburiy" };
  }

  if (!staffId) {
    try {
      const ticket = await db.ticket.update({
        where: { id: ticketId },
        data: { assignedStaffId: null, staffNote: null },
      });
      await db.callLog.create({
        data: {
          clientId: ticket.clientId,
          result: "UNASSIGNED",
          note: "Muammo mas'uli olib tashlandi",
          operatorId: g.session.userId,
        },
      });
      await logAudit("Muammo mas'uli olindi", {
        entity: "Ticket",
        entityId: ticketId,
      });
      revalidateTicket(ticket.clientId);
      return { ok: true };
    } catch {
      return { ok: false, error: "Muammo topilmadi" };
    }
  }

  const u = await db.user.findUnique({
    where: { id: staffId },
    select: { name: true, role: true, isActive: true },
  });
  if (!u || !u.isActive || !ASSIGNABLE_STAFF_ROLES.includes(u.role)) {
    return { ok: false, error: "Xodim topilmadi yoki faol emas" };
  }

  const cleanNote = assignNote(note);

  try {
    const current = await db.ticket.findUnique({
      where: { id: ticketId },
      select: { status: true },
    });
    if (!current) return { ok: false, error: "Muammo topilmadi" };
    const ticket = await db.ticket.update({
      where: { id: ticketId },
      data: {
        assignedStaffId: staffId,
        assigneeType: "XODIM",
        staffNote: cleanNote,
        status: progressIfOpen(current.status),
      },
      select: {
        clientId: true,
        title: true,
        client: { select: { restaurantName: true } },
      },
    });
    await db.callLog.create({
      data: {
        clientId: ticket.clientId,
        result: "TICKET_STAFF_ASSIGNED",
        note: `Mas'ul: ${u.name}${cleanNote ? ` — ${cleanNote}` : ""}`,
        operatorId: g.session.userId,
      },
    });
    await logAudit(`Muammo mas'uli: ${u.name} (xodim)`, {
      entity: "Ticket",
      entityId: ticketId,
      detail: cleanNote ?? undefined,
    });
    // Biriktirilgan xodimga ilova-ichi bildirishnoma (o'ziga biriktirsa — yubormaydi)
    if (staffId !== g.session.userId) {
      await createNotification({
        title: "Sizga yangi muammo biriktirildi",
        body: `${ticket.client.restaurantName} — ${ticket.title}${cleanNote ? `\n\nIzoh: ${cleanNote}` : ""}`,
        userIds: [staffId],
      });
    }
    revalidateTicket(ticket.clientId);
    return { ok: true };
  } catch {
    return { ok: false, error: "Muammo topilmadi" };
  }
}

/**
 * Muammoga usta (integrator, joyida) biriktirish/olib tashlash — faqat boshliq/admin.
 * Bosqichlar zanjirining oxirgi qadami: Yangi → TP xodimiga biriktirildi →
 * Ustaga yetkazildi (`TicketIntegratorControl` mas'ul xodim tayinlangandan
 * keyingina usta tanlovini ko'rsatadi). `ustaId: null` — olib tashlaydi.
 */
export async function assignTicketUsta(
  ticketId: string,
  ustaId: string | null,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return { ok: false, error: g.error };

  if (!ustaId) {
    try {
      const ticket = await db.ticket.update({
        where: { id: ticketId },
        data: { assignedUstaId: null, ustaNote: null },
      });
      await db.callLog.create({
        data: {
          clientId: ticket.clientId,
          result: "UNASSIGNED",
          note: "Muammodan usta olindi",
          operatorId: g.session.userId,
        },
      });
      await logAudit("Muammodan usta olindi", {
        entity: "Ticket",
        entityId: ticketId,
      });
      revalidateTicket(ticket.clientId);
      return { ok: true };
    } catch {
      return { ok: false, error: "Muammo topilmadi" };
    }
  }

  const u = await db.user.findUnique({
    where: { id: ustaId },
    select: { name: true, role: true, isActive: true },
  });
  if (!u || !u.isActive || u.role !== "INSTALLER") {
    return { ok: false, error: "Usta topilmadi yoki faol emas" };
  }

  const cleanNote = assignNote(note);

  try {
    const current = await db.ticket.findUnique({
      where: { id: ticketId },
      select: { status: true },
    });
    if (!current) return { ok: false, error: "Muammo topilmadi" };
    const ticket = await db.ticket.update({
      where: { id: ticketId },
      data: {
        assignedUstaId: ustaId,
        assigneeType: "USTA",
        ustaNote: cleanNote,
        status: progressIfOpen(current.status),
      },
    });
    await db.callLog.create({
      data: {
        clientId: ticket.clientId,
        result: "ASSIGNED",
        note: `Usta: ${u.name}${cleanNote ? ` — ${cleanNote}` : ""}`,
        operatorId: g.session.userId,
      },
    });
    await logAudit(`Muammoga usta: ${u.name}`, {
      entity: "Ticket",
      entityId: ticketId,
      detail: cleanNote ?? undefined,
    });
    revalidateTicket(ticket.clientId);
    return { ok: true };
  } catch {
    return { ok: false, error: "Muammo topilmadi" };
  }
}
