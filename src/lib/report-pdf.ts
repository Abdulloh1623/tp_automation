// Batafsil PDF hisobot: KPI + grafiklar + barcha mijozlar + muammoli mijozlar.
// A4 SVG sahifalar → resvg PNG → pdf-lib (shrift/Unicode muammosi yo'q).
import { PDFDocument } from "pdf-lib";
import { startOfMonth, startOfDay, subDays } from "date-fns";
import { db } from "./db";
import { svgToPng } from "./render-image";
import { kpiCardSvg, donutChartSvg, barChartSvg, lineChartSvg, type NamedValue } from "./charts/svg";
import { C, esc, truncate } from "./charts/theme";
import { formatMoney, formatDate } from "./utils";
import { paymentState } from "./payment-status";
import { clientStatusLabel, callResultLabel } from "./constants";

const PW = 1240;
const PH = 1754;
const PM = 70;

type Money = { USD: number; UZS: number };
function add(m: Money, cur: string, v: number) {
  m[cur === "UZS" ? "UZS" : "USD"] += v;
}
function m2(m: Money): string {
  const p: string[] = [];
  if (m.USD > 0) p.push(formatMoney(m.USD, "USD"));
  if (m.UZS > 0) p.push(formatMoney(m.UZS, "UZS"));
  return p.length ? p.join(" + ") : formatMoney(0, "USD");
}

function a4(title: string, subtitle: string, inner: string, footer: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}" font-family="Arial, sans-serif">
    <rect width="${PW}" height="${PH}" fill="#ffffff"/>
    <text x="${PM}" y="80" font-size="40" font-weight="700" fill="${C.ink}">${esc(title)}</text>
    <text x="${PM}" y="116" font-size="22" fill="${C.muted}">${esc(subtitle)}</text>
    <line x1="${PM}" y1="136" x2="${PW - PM}" y2="136" stroke="${C.grid}" stroke-width="2"/>
    ${inner}
    <text x="${PW - PM}" y="${PH - 40}" text-anchor="end" font-size="16" fill="${C.faint}">${esc(footer)}</text>
  </svg>`;
}

/** Hisobot sahifalarini PNG sifatida quradi (PDF va tekshiruv uchun). */
export async function buildReportPagePngs(): Promise<Buffer[]> {
  const monthStart = startOfMonth(new Date());
  const todayStart = startOfDay(new Date());
  const trendStart = subDays(todayStart, 29);

  const [clients, monthPayments, calls, operators] = await Promise.all([
    db.client.findMany({
      orderBy: [{ status: "asc" }, { restaurantName: "asc" }],
      include: {
        tickets: { where: { status: { not: "RESOLVED" } }, select: { title: true } },
        callLogs: {
          orderBy: { calledAt: "desc" },
          take: 8,
          select: { result: true, note: true },
        },
      },
    }),
    db.payment.findMany({
      where: { paidAt: { gte: monthStart } },
      select: { amount: true, currency: true, recordedById: true },
    }),
    db.callLog.findMany({
      where: { calledAt: { gte: trendStart } },
      select: { calledAt: true, operatorId: true, result: true, clientId: true },
    }),
    db.user.findMany({
      where: { role: { in: ["OPERATOR", "ADMIN"] } },
      select: { id: true, name: true },
    }),
  ]);

  // KPI
  const active = clients.filter((c) => c.status === "ACTIVE");
  const mrr: Money = { USD: 0, UZS: 0 };
  for (const c of active) add(mrr, c.currency, c.monthlyAmount);
  const collected: Money = { USD: 0, UZS: 0 };
  for (const p of monthPayments) add(collected, p.currency, p.amount);
  const overdueClients = active.filter(
    (c) => !!c.nextPaymentDate && c.nextPaymentDate < todayStart,
  );
  const overdue: Money = { USD: 0, UZS: 0 };
  for (const c of overdueClients) add(overdue, c.currency, c.monthlyAmount);
  const openTickets = clients.reduce((s, c) => s + c.tickets.length, 0);

  const kpis = [
    { label: "Jami mijozlar", value: String(clients.length) },
    { label: "Faol mijozlar", value: String(active.length) },
    { label: "MRR (oylik)", value: m2(mrr), accent: "#8b5cf6" },
    { label: "Bu oy yig'ilgan", value: m2(collected), accent: "#10b981" },
    { label: "Qarzdorlar", value: String(overdueClients.length), sub: m2(overdue), accent: "#f43f5e" },
    { label: "Ochiq muammolar", value: String(openTickets), accent: "#f59e0b" },
  ];

  // Holat donut
  const stMap = new Map<string, number>();
  for (const c of clients) stMap.set(c.status, (stMap.get(c.status) ?? 0) + 1);
  const statusItems: NamedValue[] = [...stMap.entries()].map(([k, v]) => ({
    label: clientStatusLabel(k),
    value: v,
  }));

  // Viloyat bar
  const rgMap = new Map<string, number>();
  for (const c of clients) {
    const r = c.region ?? "Belgilanmagan";
    rgMap.set(r, (rgMap.get(r) ?? 0) + 1);
  }
  const regionItems: NamedValue[] = [...rgMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // 30-kun trend (qo'ng'iroqlar)
  const trendPoints: NamedValue[] = [];
  for (let i = 29; i >= 0; i--) {
    const dayStart = subDays(todayStart, i);
    const dayEnd = subDays(todayStart, i - 1);
    const cnt = calls.filter((c) => c.calledAt >= dayStart && c.calledAt < dayEnd).length;
    const d = dayStart;
    trendPoints.push({ label: `${d.getDate()}.${d.getMonth() + 1}`, value: cnt });
  }

  // Bugungi qo'ng'iroq natijalari (holatlar soni)
  const todayCalls = calls.filter((c) => c.calledAt >= todayStart);
  const outcomeMap = new Map<string, number>();
  for (const c of todayCalls) outcomeMap.set(c.result, (outcomeMap.get(c.result) ?? 0) + 1);
  const outcomeItems: NamedValue[] = [...outcomeMap.entries()]
    .map(([k, v]) => ({ label: callResultLabel(k), value: v }))
    .sort((a, b) => b.value - a.value);
  const MISSED = ["NO_ANSWER", "PHONE_OFF", "BUSY"];
  const todayContacted = new Set(todayCalls.map((c) => c.clientId)).size;
  const todayMissed = todayCalls.filter((c) => MISSED.includes(c.result)).length;
  const todayTalked = todayCalls.length - todayMissed;

  // Operatorlar
  const callsByOp = new Map<string, number>();
  for (const c of calls) if (c.operatorId) callsByOp.set(c.operatorId, (callsByOp.get(c.operatorId) ?? 0) + 1);
  const payByOp = new Map<string, Money>();
  for (const p of monthPayments) {
    if (!p.recordedById) continue;
    const e = payByOp.get(p.recordedById) ?? { USD: 0, UZS: 0 };
    add(e, p.currency, p.amount);
    payByOp.set(p.recordedById, e);
  }
  const operatorItems: NamedValue[] = operators
    .map((o) => ({ label: o.name, value: callsByOp.get(o.id) ?? 0 }))
    .filter((o) => o.value > 0)
    .sort((a, b) => b.value - a.value);

  // Muammoli mijozlar
  type Problem = { name: string; meta: string; issue: string };
  const problems: Problem[] = [];
  for (const c of clients) {
    const parts: string[] = [];
    if (c.specialNote) parts.push("Maxsus: " + c.specialNote);
    if (c.tickets.length) parts.push("Muammo: " + c.tickets.map((t) => t.title).join("; "));
    const issueCall = c.callLogs.find((l) => l.result === "HAS_ISSUE" && l.note);
    if (issueCall?.note) parts.push("Muammo izohi: " + issueCall.note);
    if (c.status === "ACTIVE" && c.nextPaymentDate && c.nextPaymentDate < todayStart) {
      const days = Math.floor((todayStart.getTime() - c.nextPaymentDate.getTime()) / 86400000);
      parts.push(`Qarzdor: ${days} kun`);
    }
    // Faqat muammoli (yuqoridagi mezonlardan biri) mijozga oxirgi qo'ng'iroq
    // izohini (operator commenti) qo'shamiz — kontekst uchun
    if (parts.length) {
      const lastNote = c.callLogs.find((l) => l.note && l.note.trim())?.note;
      if (lastNote && !parts.some((p) => p.includes(lastNote))) {
        parts.push("Izoh: " + lastNote);
      }
      problems.push({
        name: c.restaurantName,
        meta: `${c.region ?? "—"} · ${c.phone}`,
        issue: parts.join(" | "),
      });
    }
  }

  const dateLabel = formatDate(new Date());

  // --- Sahifalarni qurish (SVG → PNG) ---
  const pngPages: Buffer[] = [];

  // 1. KPI muqova
  pngPages.push(svgToPng(kpiCardSvg({ title: "Kunlik hisobot", dateLabel, kpis }), 1000));
  // 2. Bugungi qo'ng'iroq natijalari (holatlar soni)
  pngPages.push(
    svgToPng(
      barChartSvg({
        title: "Bugungi natijalar (qo'ng'iroq holatlari)",
        subtitle: `Bugun ${todayCalls.length} qo'ng'iroq · ${todayContacted} mijoz · gaplashildi ${todayTalked} · ko'tarmadi ${todayMissed}`,
        items: outcomeItems,
        unit: "ta",
        color: "#6366f1",
      }),
      1000,
    ),
  );
  // 3-6. Grafiklar (reused builderlar)
  pngPages.push(svgToPng(donutChartSvg({ title: "Mijozlar holati", items: statusItems }), 1000));
  if (regionItems.length)
    pngPages.push(svgToPng(barChartSvg({ title: "Viloyatlar bo'yicha mijozlar", items: regionItems, unit: "ta", color: "#0ea5e9" }), 1000));
  pngPages.push(svgToPng(lineChartSvg({ title: "Qo'ng'iroqlar — oxirgi 30 kun", points: trendPoints, unit: "soni" }), 1000));
  if (operatorItems.length)
    pngPages.push(svgToPng(barChartSvg({ title: "Operatorlar — qo'ng'iroqlar (oy)", items: operatorItems, unit: "ta" }), 1000));

  // N. Muammoli mijozlar (izohlari bilan)
  const PROB_PER = 14;
  const probPages = Math.max(1, Math.ceil(problems.length / PROB_PER));
  for (let p = 0; p < probPages; p++) {
    const slice = problems.slice(p * PROB_PER, (p + 1) * PROB_PER);
    let inner = "";
    if (slice.length === 0) {
      inner = `<text x="${PM}" y="220" font-size="22" fill="${C.faint}">Muammoli mijoz yo'q</text>`;
    } else {
      slice.forEach((pr, i) => {
        const y = 190 + i * 108;
        inner += `<rect x="${PM}" y="${y}" width="${PW - 2 * PM}" height="96" rx="10" fill="#fff7ed" stroke="#fed7aa"/>`;
        inner += `<text x="${PM + 18}" y="${y + 34}" font-size="22" font-weight="700" fill="${C.ink}">${esc(truncate(pr.name, 60))}</text>`;
        inner += `<text x="${PW - PM - 18}" y="${y + 34}" text-anchor="end" font-size="17" fill="${C.muted}">${esc(pr.meta)}</text>`;
        inner += `<text x="${PM + 18}" y="${y + 68}" font-size="18" fill="#9a3412">${esc(truncate(pr.issue, 110))}</text>`;
      });
    }
    const sub = `Jami ${problems.length} ta · sahifa ${p + 1}/${probPages}`;
    pngPages.push(svgToPng(a4Svg("Muammoli mijozlar", sub, inner, dateLabel)));
  }

  return pngPages;
}

/** Hisobot PDF'ini (Buffer) quradi. */
export async function buildReportPdf(): Promise<Buffer> {
  const pngPages = await buildReportPagePngs();
  const pdf = await PDFDocument.create();
  for (const png of pngPages) {
    const img = await pdf.embedPng(png);
    const page = pdf.addPage([595, 842]);
    const scale = (595 - 60) / img.width;
    const w = img.width * scale;
    const h = img.height * scale;
    if (h <= 842 - 60) {
      // bir rasm sahifa tepasida
      page.drawImage(img, { x: 30, y: 842 - 30 - h, width: w, height: h });
    } else {
      // balandroq — butun sahifaga sig'dirish
      const s2 = (842 - 40) / img.height;
      const w2 = img.width * s2;
      page.drawImage(img, { x: (595 - w2) / 2, y: 20, width: w2, height: 842 - 40 });
    }
  }
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// a4() bilan bir xil, lekin nom to'qnashuvini oldini olish uchun alohida nom
function a4Svg(title: string, subtitle: string, inner: string, footer: string): string {
  return a4(title, subtitle, inner, footer);
}
