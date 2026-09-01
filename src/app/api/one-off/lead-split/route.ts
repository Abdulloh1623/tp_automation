import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { ACTIVE_STAGES } from "@/lib/constants";

/**
 * BIR MARTALIK skript (2026-09-01) — CLAUDE.md'ga yozilmagan, ishlatilgach o'chiriladi.
 *
 * Bugungi kunlik lidlarni 2 mezon bo'yicha 3 xodimga (Abdulla/Javohir/Mehroj)
 * ulush bilan (37/37/26%) biriktiradi:
 *  - 1-daraja: hech qachon qo'ng'iroq qilinmagan ("yangi") mijozlar
 *  - 2-daraja: avgust 2026'da o'rnatilgan (contractDate), lekin allaqachon
 *    aloqa qilingan mijozlar
 * Har ikki daraja alohida o'sha ulush bilan bo'linadi (xodim ikkalasidan ham
 * o'z ulushini oladi). `?commit=1` bo'lmasa faqat hisoblab ko'rsatadi, yozmaydi.
 */

const OPERATOR_SHARES: [string, number][] = [
  ["Abdulla", 37],
  ["Javohir", 37],
  ["Mehroj", 26],
];

function splitShares<T>(items: T[]): Record<string, T[]> {
  const total = items.length;
  const result: Record<string, T[]> = {};
  let idx = 0;
  let assignedTotal = 0;
  OPERATOR_SHARES.forEach(([name, pct], i) => {
    const isLast = i === OPERATOR_SHARES.length - 1;
    const count = isLast ? total - assignedTotal : Math.round((pct / 100) * total);
    result[name] = items.slice(idx, idx + count);
    idx += count;
    assignedTotal += count;
  });
  return result;
}

export async function GET(req: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if (!auth.ok) {
    return new Response(auth.status === 401 ? "Unauthorized" : "Forbidden", {
      status: auth.status,
    });
  }

  const url = new URL(req.url);
  const commit = url.searchParams.get("commit") === "1";

  const candidates = await db.user.findMany({
    where: { role: { in: ["OPERATOR", "ADMIN", "MANAGER"] }, isActive: true },
    select: { id: true, name: true },
  });
  const userMap = new Map<string, { id: string; name: string }>();
  for (const [target] of OPERATOR_SHARES) {
    const matches = candidates.filter(
      (c) => c.name.trim().toLowerCase() === target.toLowerCase(),
    );
    if (matches.length !== 1) {
      return Response.json(
        {
          error: `"${target}" uchun aniq bitta xodim topilmadi (${matches.length} ta mos)`,
          candidates: candidates.map((c) => c.name),
        },
        { status: 400 },
      );
    }
    userMap.set(target, matches[0]);
  }

  const tier1 = await db.client.findMany({
    where: {
      status: "ACTIVE",
      stage: { in: [...ACTIVE_STAGES] },
      callLogs: { none: {} },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const augStart = new Date(Date.UTC(2026, 7, 1, 0, 0, 0));
  const augEnd = new Date(Date.UTC(2026, 8, 1, 0, 0, 0));
  const tier2 = await db.client.findMany({
    where: {
      status: "ACTIVE",
      stage: { in: [...ACTIVE_STAGES] },
      callLogs: { some: {} },
      contractDate: { gte: augStart, lt: augEnd },
    },
    select: { id: true },
    orderBy: { contractDate: "asc" },
  });

  const tier1Split = splitShares(tier1);
  const tier2Split = splitShares(tier2);

  const summary = OPERATOR_SHARES.map(([name]) => ({
    name,
    tier1: tier1Split[name].length,
    tier2: tier2Split[name].length,
    total: tier1Split[name].length + tier2Split[name].length,
  }));

  if (!commit) {
    return Response.json({
      dryRun: true,
      tier1Total: tier1.length,
      tier2Total: tier2.length,
      summary,
    });
  }

  for (const [name] of OPERATOR_SHARES) {
    const user = userMap.get(name)!;
    const ids = [...tier1Split[name], ...tier2Split[name]].map((c) => c.id);
    if (ids.length) {
      await db.client.updateMany({
        where: { id: { in: ids } },
        data: { assignedToId: user.id, nextContactDate: null },
      });
    }
  }

  await logAudit("Bir martalik taqsimot: yangi+avgust mijozlar", {
    entity: "Client",
    detail: summary
      .map((s) => `${s.name}: ${s.total} (yangi ${s.tier1}, avgust ${s.tier2})`)
      .join(" · "),
  });

  return Response.json({
    committed: true,
    tier1Total: tier1.length,
    tier2Total: tier2.length,
    summary,
  });
}
