// "Oxirgi 7 kun — men gaplashgan lidlar": qo'ng'iroq jurnalini KUN bo'yicha
// guruhlaydi (profil sahifasi).
//
// Ikki qoida:
//
//  1. Kun chegarasi UTC+5 (Toshkent) bo'yicha — `tzDayKey`. Server UTC'da
//     ishlaydi, `toISOString().slice(0,10)` esa 00:00–05:00 oralig'idagi
//     qo'ng'iroqni oldingi kunga tashlab yuborardi.
//  2. Bir kun ichida bitta mijozga bir necha marta qo'ng'iroq bo'lishi mumkin —
//     ro'yxat LIDLAR ro'yxati, shuning uchun mijoz bir marta ko'rinadi:
//     o'sha kundagi OXIRGI natija bilan, yonida qo'ng'iroqlar soni.
//
// Sof funksiya: "hozir" argument sifatida uzatiladi (testlarda muzlatiladi).

import { tzDayKey, tzDayStart, tzTimeLabel } from "./tz";
import { TALKED_RESULTS, callResultLabel } from "./constants";
import { formatDateLong } from "./utils";

/** Ro'yxat necha kunni qamraydi (bugun + oldingi 6). */
export const WEEK_CALLS_DAYS = 7;

const DAY_MS = 86_400_000;

export type WeekCall = {
  clientId: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  calledAt: Date;
  result: string;
  note: string | null;
};

/** Bir kun ichidagi bitta lid (mijoz) — o'sha kundagi oxirgi natijasi bilan. */
export type DayCallItem = {
  clientId: string;
  name: string;
  phone: string;
  time: string; // oxirgi qo'ng'iroq vaqti, "HH:MM" (UTC+5)
  result: string;
  resultLabel: string;
  note: string | null;
  calls: number; // shu kundagi qo'ng'iroqlar soni (1 dan ko'p bo'lishi mumkin)
  talked: boolean; // shu kuni HAQIQATAN gaplashilganmi (bir marta bo'lsa ham)
};

export type DayCallGroup = {
  key: string; // "YYYY-MM-DD" (UTC+5)
  label: string; // "shanba, 01-avgust"
  isToday: boolean;
  leads: number; // kundagi noyob mijozlar soni
  talked: number; // shulardan gaplashilganlari
  items: DayCallItem[];
};

/**
 * Qo'ng'iroqlarni oxirgi `WEEK_CALLS_DAYS` kunga bo'ladi. Kunlar HAR DOIM
 * to'liq qaytadi (bo'sh kun ham) — "o'sha kuni ishlamaganman"ni ko'rsatish
 * ro'yxatda kunni umuman ko'rsatmaslikdan tushunarliroq.
 */
export function groupCallsByDay(calls: WeekCall[], now = new Date()): DayCallGroup[] {
  const todayStart = tzDayStart(now);
  const todayKey = tzDayKey(todayStart);

  // Kun kaliti -> guruh (bo'sh kunlar bilan birga, bugundan orqaga)
  const groups = new Map<string, DayCallGroup>();
  const order: DayCallGroup[] = [];
  for (let i = 0; i < WEEK_CALLS_DAYS; i++) {
    const dayStart = new Date(todayStart.getTime() - i * DAY_MS);
    const key = tzDayKey(dayStart);
    const group: DayCallGroup = {
      key,
      label: formatDateLong(dayStart),
      isToday: key === todayKey,
      leads: 0,
      talked: 0,
      items: [],
    };
    groups.set(key, group);
    order.push(group);
  }

  // Yangi qo'ng'iroq oldinda — mijozning kundagi OXIRGI natijasi shu bo'ladi.
  const sorted = [...calls].sort((a, b) => b.calledAt.getTime() - a.calledAt.getTime());
  const seen = new Map<string, DayCallItem>(); // `${kun}|${mijoz}` -> yozuv

  for (const c of sorted) {
    const group = groups.get(tzDayKey(c.calledAt));
    if (!group) continue; // oynadan tashqari (eski) qo'ng'iroq
    const talked = TALKED_RESULTS.includes(c.result);
    const seenKey = `${group.key}|${c.clientId}`;
    const existing = seen.get(seenKey);
    if (existing) {
      existing.calls += 1;
      // Kun davomida bir marta ham gaplashilgan bo'lsa — gaplashilgan hisoblanadi.
      existing.talked ||= talked;
      continue;
    }
    const item: DayCallItem = {
      clientId: c.clientId,
      name: c.restaurantName || c.fullName || "—",
      phone: c.phone,
      time: tzTimeLabel(c.calledAt),
      result: c.result,
      resultLabel: callResultLabel(c.result),
      note: c.note,
      calls: 1,
      talked,
    };
    seen.set(seenKey, item);
    group.items.push(item);
  }

  for (const g of order) {
    g.leads = g.items.length;
    g.talked = g.items.filter((i) => i.talked).length;
  }
  return order;
}
