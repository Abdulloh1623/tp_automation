"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { canMutateClient } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { TICKET_STATUS } from "@/lib/constants";
import {
  ticketTypeEnum,
  ticketPriorityEnum,
  isTicketStatus,
  toFieldErrors,
} from "@/lib/validation";

const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];

function s(v: FormDataEntryValue | null): string | undefined {
  const str = typeof v === "string" ? v.trim() : "";
  return str === "" ? undefined : str;
}

const ticketSchema = z.object({
  clientId: z.string().min(1, "Mijoz tanlanmagan"),
  title: z.string().min(1, "Muammo sarlavhasini kiriting").max(300, "Sarlavha juda uzun"),
  type: ticketTypeEnum.default("TECHNICAL"),
  priority: ticketPriorityEnum.default("MEDIUM"),
});

export type TicketFormState = { error?: string; fieldErrors?: Record<string, string> };

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
    return { error: "Maʼlumotlarni tekshiring", fieldErrors: toFieldErrors(parsed.error) };
  }

  const client = await db.client.findUnique({
    where: { id: parsed.data.clientId },
    select: { id: true, assignedToId: true },
  });
  if (!client) return { error: "Mijoz topilmadi" };
  if (!(await canMutateClient(session, client.id))) {
    return { error: "Bu mijoz sizga biriktirilmagan" };
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

  await logAudit("Muammo yaratildi", {
    entity: "Ticket",
    entityId: client.id,
    detail: parsed.data.title,
  });
  revalidateTicket(client.id);
  return {};
}

/** Ticket holatini o'zgartirish. Form action sifatida: bind(null, id, status). */
export async function setTicketStatus(
  ticketId: string,
  status: string,
  formData: FormData,
): Promise<void> {
  const g = await guardRole(STAFF);
  if (!g.ok) return; // ruxsatsiz — jimgina

  // status faqat ruxsat etilgan qiymatlardan biri bo'lishi shart
  // (`in` prototip kalitlarini ham true qaytaradi — enum predikat ishlatamiz)
  if (!isTicketStatus(status)) return;

  // Egalik: OPERATOR faqat o'z mijozining muammosini o'zgartira oladi
  const owner = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { clientId: true },
  });
  if (!owner) return;
  if (!(await canMutateClient(g.session, owner.clientId))) return;

  const resolutionNote = s(formData.get("resolutionNote"));
  const data = {
    status,
    resolvedAt: status === "RESOLVED" ? new Date() : null,
    // RESOLVED bo'lmasa (qayta ochilganda) eski yechim izohi tozalanadi
    resolutionNote: status === "RESOLVED" ? (resolutionNote ?? null) : null,
  };

  try {
    const ticket = await db.ticket.update({ where: { id: ticketId }, data });
    await logAudit(`Muammo holati: ${TICKET_STATUS[status as keyof typeof TICKET_STATUS] ?? status}`, {
      entity: "Ticket",
      entityId: ticketId,
    });
    revalidateTicket(ticket.clientId);
  } catch {
    // mavjud bo'lmagan ticketId — jimgina o'tkazib yuboramiz
  }
}

export type TicketAssigneeType = "USTA" | "XODIM";

// XODIM sifatida biriktirilishi mumkin bo'lgan ofis xodimlari (usta emas)
const ASSIGNABLE_STAFF_ROLES = ["ADMIN", "MANAGER", "OPERATOR"];

/**
 * Muammoni hal qiluvchiga biriktirish/olib tashlash — polimorf. Faqat boshliq/admin.
 *
 * - `assigneeType: "USTA"` — integrator (usta) joyida hal etadi.
 * - `assigneeType: "XODIM"` — ofis xodimi (operator/menejer/admin) online hal etadi.
 * - `assigneeId: null` (yoki assigneeType: null) — biriktiruv butunlay olinadi.
 *
 * Biriktirilganda muammo "Jarayonda" holatiga o'tadi; ikki tur bir vaqtda saqlanmaydi.
 */
export async function assignTicket(
  ticketId: string,
  assigneeType: TicketAssigneeType | null,
  assigneeId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return { ok: false, error: g.error };

  // Biriktiruvni olib tashlash
  if (!assigneeType || !assigneeId) {
    try {
      const ticket = await db.ticket.update({
        where: { id: ticketId },
        data: { assigneeType: null, assignedUstaId: null, assignedStaffId: null },
      });
      await logAudit("Muammo biriktiruvi olindi", { entity: "Ticket", entityId: ticketId });
      revalidateTicket(ticket.clientId);
      return { ok: true };
    } catch {
      return { ok: false, error: "Muammo topilmadi" };
    }
  }

  if (assigneeType !== "USTA" && assigneeType !== "XODIM") {
    return { ok: false, error: "Biriktiruv turi noto'g'ri" };
  }

  // Biriktiriluvchini tekshirish (rol + faollik)
  const assignee = await db.user.findUnique({
    where: { id: assigneeId },
    select: { name: true, role: true, isActive: true },
  });
  if (!assignee || !assignee.isActive) {
    return { ok: false, error: "Biriktiriluvchi topilmadi yoki faol emas" };
  }
  if (assigneeType === "USTA" && assignee.role !== "INSTALLER") {
    return { ok: false, error: "Integrator (usta) topilmadi" };
  }
  if (assigneeType === "XODIM" && !ASSIGNABLE_STAFF_ROLES.includes(assignee.role)) {
    return { ok: false, error: "Xodim (ofis) topilmadi" };
  }

  try {
    const ticket = await db.ticket.update({
      where: { id: ticketId },
      data: {
        assigneeType,
        // Faqat bitta biriktiruv turi saqlanadi — ikkinchisi tozalanadi
        assignedUstaId: assigneeType === "USTA" ? assigneeId : null,
        assignedStaffId: assigneeType === "XODIM" ? assigneeId : null,
        // Biriktirilganda ish boshlandi hisoblanadi
        status: "IN_PROGRESS",
      },
    });
    await logAudit(
      assigneeType === "USTA"
        ? `Muammo joyida hal qilish uchun ${assignee.name} (usta)ga biriktirildi`
        : `Muammo online hal qilish uchun ${assignee.name} (xodim)ga biriktirildi`,
      { entity: "Ticket", entityId: ticketId, detail: assigneeType },
    );
    revalidateTicket(ticket.clientId);
    return { ok: true };
  } catch {
    return { ok: false, error: "Muammo topilmadi" };
  }
}

/**
 * Eski chaqiruvlar bilan moslik uchun ingichka o'ram — usta biriktirish/olib tashlash.
 * @deprecated `assignTicket(ticketId, "USTA", ustaId)` dan foydalaning.
 */
export async function assignTicketUsta(
  ticketId: string,
  ustaId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  return assignTicket(ticketId, ustaId ? "USTA" : null, ustaId);
}
