// Jim churn ogohlantirishi — worker cron'ida (scripts/bot.ts) kuniga bir marta.
// Boshliqlarga (ADMIN + MANAGER) ilova bildirishnomasi va Telegram xabari.
//
// Bu yerda `db` va Telegram ishlatiladi, shuning uchun `next/headers`ga bog'liq
// narsalar YO'Q — worker jarayonida ham ishlashi shart.

import { db } from "./db";
import { escapeHtml, sendMessage } from "./telegram";
import { createNotification } from "./notifications";
import { formatMoney } from "./utils";
import { getSilentChurn } from "./silent-churn";
import type { Money } from "./finance";

/** Hisobotda ko'rsatiladigan mijozlar soni (qolgani "…va yana N ta"). */
const PREVIEW = 8;

function money2(m: Money): string {
  const parts: string[] = [];
  if (m.USD > 0) parts.push(formatMoney(m.USD, "USD"));
  if (m.UZS > 0) parts.push(formatMoney(m.UZS, "UZS"));
  return parts.length ? parts.join(" + ") : formatMoney(0, "USD");
}

export type SilentChurnAlertResult = {
  count: number;
  notified: number;
  telegram: number;
};

/**
 * Biznex obunasi tugagan, ammo CRM'da faol turgan mijozlar bo'yicha kunlik
 * ogohlantirish. SLA bilan bir xil konvensiya: muammo bartaraf bo'lmaguncha
 * HAR KUNI eslatiladi (mijoz otkazga o'tkazilsa yoki obunasi tiklansa —
 * ro'yxatdan o'zi chiqadi).
 */
export async function runSilentChurnCheck(): Promise<SilentChurnAlertResult> {
  const s = await getSilentChurn(PREVIEW);
  if (s.count === 0) return { count: 0, notified: 0, telegram: 0 };

  const managers = await db.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
    select: { id: true, telegramId: true },
  });

  const title = "Jim churn: obunasi tugagan faol mijozlar";
  const lines = s.clients.map(
    (c) =>
      `• ${c.restaurantName} — ${formatMoney(c.monthlyAmount, c.currency)}` +
      (c.operatorName ? ` · ${c.operatorName}` : " · biriktirilmagan"),
  );
  if (s.count > s.clients.length) lines.push(`…va yana ${s.count - s.clients.length} ta`);

  const body =
    `${s.count} ta mijoz Biznex'da obunasiz, lekin CRM'da faol turibdi. ` +
    `MRR xavf ostida: ${money2(s.atRisk)}.\n` +
    lines.join("\n");

  await createNotification({
    title,
    body,
    priority: "IMPORTANT",
    userIds: managers.map((m) => m.id),
  });

  const text =
    `🟡 <b>${escapeHtml(title)}</b>\n` +
    `${s.count} ta mijoz · MRR xavf ostida: <b>${escapeHtml(money2(s.atRisk))}</b>\n` +
    lines.map((l) => escapeHtml(l)).join("\n");

  let telegram = 0;
  for (const m of managers) {
    if (!m.telegramId) continue;
    try {
      await sendMessage(m.telegramId, text);
      telegram++;
    } catch {
      /* eng yaxshi harakat — bittasi yiqilsa qolganlarini to'xtatmaymiz */
    }
  }

  return { count: s.count, notified: managers.length, telegram };
}
