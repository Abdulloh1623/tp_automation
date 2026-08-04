// 3-kunlik SLA — muammo/eskalatsiya belgilangan muddatda hal bo'lmasa
// ogohlantiriladi. `runSlaCheck` worker cron'ida (scripts/bot.ts) kuniga
// chaqiriladi: buzilganlarni topib, ilova bildirishnomasi + Telegram yuboradi.
import { startOfDay, subMonths } from "date-fns";
import { db } from "./db";
import { escapeHtml, sendMessage } from "./telegram";
import { createNotification } from "./notifications";
import { ESCALATION_STAGES } from "./escalation";

/** SLA muddati (kun). Muammo/eskalatsiya shu kundan oshsa — buzilgan hisoblanadi. */
export const SLA_DAYS = 3;

/** Qaytarish "Jarayonda" bosqichi uchun SLA muddati — bu boshqacha, qisqaroq (2 kun). */
export const RETURN_SLA_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shu vaqtdan oldingi narsalar SLA'ni buzgan. */
export function slaThreshold(now: Date = new Date()): Date {
  return new Date(now.getTime() - SLA_DAYS * DAY_MS);
}

/** Qaytarish "Jarayonda" bosqichi uchun chegara — 2 kundan oshgan. */
export function returnSlaThreshold(now: Date = new Date()): Date {
  return new Date(now.getTime() - RETURN_SLA_DAYS * DAY_MS);
}

function daysSince(from: Date, now: Date): number {
  return Math.max(1, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
}

async function pushTelegram(chatIds: Set<string>, title: string, body: string) {
  const text = `🔴 <b>${escapeHtml(title)}</b>\n${escapeHtml(body)}`;
  for (const chat of chatIds) {
    try {
      await sendMessage(chat, text);
    } catch {
      /* eng yaxshi harakat — bittasi yiqilsa qolganlarini to'xtatmaymiz */
    }
  }
}

/**
 * 3 kundan oshgan hal bo'lmagan muammo va eskalatsiyalarni topib, mas'ul +
 * boshliqlarga ilova bildirishnomasi va Telegram ogohlantirishi yuboradi.
 * Muammo/eskalatsiya HAL BO'LMAGUNCHA har KUNI qayta ogohlantiriladi
 * (cron kuniga bir marta — 10:00 ishlaydi). Bir kunда ikki marta ishlasa ham
 * `slaNotifiedAt` shu kunni belgilaydi — takror yubormaydi.
 */
export async function runSlaCheck(
  now: Date = new Date(),
): Promise<{ tickets: number; escalations: number; returns: number; suggestions: number }> {
  const threshold = slaThreshold(now);
  const returnThreshold = returnSlaThreshold(now);

  // Ogohlantiriladigan boshliqlar (admin + menejer) — bir marta olinadi
  const managers = await db.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
    select: { id: true, telegramId: true },
  });
  const managerIds = managers.map((m) => m.id);
  const managerTg = managers.map((m) => m.telegramId).filter((x): x is string => !!x);

  // Bugun allaqachon ogohlantirilganini o'tkazib yuboramiz — hal bo'lmaguncha
  // har kuni bir marta qayta yuboriladi (bir kunда faqat bir marta).
  const dayStart = startOfDay(now);
  const notifiedToday = (at: Date | null) => at != null && at >= dayStart;

  // --- Muammolar (Ticket) ---
  const tickets = await db.ticket.findMany({
    where: { status: { not: "RESOLVED" }, createdAt: { lt: threshold } },
    select: {
      id: true,
      title: true,
      createdAt: true,
      slaNotifiedAt: true,
      client: { select: { restaurantName: true } },
      assignedStaff: { select: { id: true, telegramId: true } },
    },
  });
  let ticketCount = 0;
  for (const t of tickets) {
    if (notifiedToday(t.slaNotifiedAt)) continue;
    const days = daysSince(t.createdAt, now);
    const title = "Muammo 3 kundan beri hal bo'lmadi";
    const body = `"${t.title}" — ${t.client.restaurantName} (${days} kun). Iltimos yakuniga yetkazing.`;

    const userIds = [...managerIds];
    if (t.assignedStaff) userIds.push(t.assignedStaff.id);
    await createNotification({ title, body, userIds });

    const tg = new Set(managerTg);
    if (t.assignedStaff?.telegramId) tg.add(t.assignedStaff.telegramId);
    await pushTelegram(tg, title, body);

    await db.ticket.update({ where: { id: t.id }, data: { slaNotifiedAt: now } });
    ticketCount++;
  }

  // --- Eskalatsiya (Client stage) ---
  const escClients = await db.client.findMany({
    where: {
      stage: { in: [...ESCALATION_STAGES] },
      OR: [
        { escalatedAt: { lt: threshold } },
        // escalatedAt yo'q (eski yozuv) — updatedAt bo'yicha taxminlaymiz
        { escalatedAt: null, updatedAt: { lt: threshold } },
      ],
    },
    select: {
      id: true,
      restaurantName: true,
      escalatedAt: true,
      updatedAt: true,
      slaNotifiedAt: true,
      escalationStaff: { select: { id: true, telegramId: true } },
    },
  });
  let escCount = 0;
  for (const c of escClients) {
    if (notifiedToday(c.slaNotifiedAt)) continue;
    const days = daysSince(c.escalatedAt ?? c.updatedAt, now);
    const title = "Eskalatsiya 3 kundan beri yakunlanmadi";
    const body = `${c.restaurantName} (${days} kun). Usta/mijoz bilan bog'lanib yakuniga yetkazing.`;

    const userIds = [...managerIds];
    if (c.escalationStaff) userIds.push(c.escalationStaff.id);
    await createNotification({ title, body, userIds });

    const tg = new Set(managerTg);
    if (c.escalationStaff?.telegramId) tg.add(c.escalationStaff.telegramId);
    await pushTelegram(tg, title, body);

    await db.client.update({ where: { id: c.id }, data: { slaNotifiedAt: now } });
    escCount++;
  }

  // --- Qaytarish (EquipmentReturnRequest "Jarayonda") — 2 kundan oshganlar ---
  const returnReqs = await db.equipmentReturnRequest.findMany({
    where: {
      status: "IN_PROGRESS",
      OR: [
        { inProgressAt: { lt: returnThreshold } },
        // inProgressAt yo'q (eski/backfill qilinmagan yozuv) — createdAt bo'yicha taxminlaymiz
        { inProgressAt: null, createdAt: { lt: returnThreshold } },
      ],
    },
    select: {
      id: true,
      createdAt: true,
      inProgressAt: true,
      slaNotifiedAt: true,
      client: { select: { restaurantName: true } },
      staff: { select: { id: true, telegramId: true } },
    },
  });
  let returnCount = 0;
  for (const r of returnReqs) {
    if (notifiedToday(r.slaNotifiedAt)) continue;
    const days = daysSince(r.inProgressAt ?? r.createdAt, now);
    const title = "Qaytarish 2 kundan beri yakunlanmadi";
    const body = `${r.client.restaurantName} (${days} kun). Usta/mijoz bilan bog'lanib yakuniga yetkazing.`;

    const userIds = [...managerIds];
    if (r.staff) userIds.push(r.staff.id);
    await createNotification({ title, body, userIds });

    const tg = new Set(managerTg);
    if (r.staff?.telegramId) tg.add(r.staff.telegramId);
    await pushTelegram(tg, title, body);

    await db.equipmentReturnRequest.update({ where: { id: r.id }, data: { slaNotifiedAt: now } });
    returnCount++;
  }

  // --- Takliflar (Suggestion) — 1 oydan oshib hal qilinmaganlar ---
  const monthAgo = subMonths(now, 1);
  const suggestions = await db.suggestion.findMany({
    where: { status: "OPEN", createdAt: { lt: monthAgo } },
    select: {
      id: true,
      body: true,
      createdAt: true,
      notifiedAt: true,
      client: { select: { restaurantName: true } },
    },
  });
  let suggestionCount = 0;
  for (const s of suggestions) {
    if (notifiedToday(s.notifiedAt)) continue;
    const days = daysSince(s.createdAt, now);
    const title = "Taklif 1 oydan beri hal qilinmadi";
    const snippet = s.body.length > 120 ? `${s.body.slice(0, 120)}…` : s.body;
    const body = `${s.client.restaurantName} (${days} kun): ${snippet}`;

    // Faqat boshliqlarga (admin/menejer) — Takliflar bo'limi ularniki
    await createNotification({ title, body, userIds: managerIds });
    await pushTelegram(new Set(managerTg), title, body);

    await db.suggestion.update({ where: { id: s.id }, data: { notifiedAt: now } });
    suggestionCount++;
  }

  return {
    tickets: ticketCount,
    escalations: escCount,
    returns: returnCount,
    suggestions: suggestionCount,
  };
}
