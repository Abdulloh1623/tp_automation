import { TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type RegionCoverageRow = {
  region: string;
  /** Shu viloyatni qoplaydigan (User.regions'ga ega) faol operatorlar. */
  operatorNames: string[];
  /** Ular orasida BUGUN ish jadvalida (DutyDay) turganlar. */
  onDutyNames: string[];
  /** Shu viloyatdagi faol (ACTIVE) mijozlar soni. */
  clientCount: number;
};

/**
 * Admin "Viloyat bo'yicha taqsimlash"ni yoqishdan oldin bo'shliqlarni ko'rishi
 * uchun diagnostika: har viloyat kimga biriktirilgan, ular bugun ishlayaptimi
 * va u yerda nechta mijoz bor. Yoqilgan bo'lsa ham, tuzatish uchun foydali.
 */
export function RegionCoveragePanel({
  rows,
  enabled,
}: {
  rows: RegionCoverageRow[];
  enabled: boolean;
}) {
  const uncovered = rows.filter((r) => r.region !== "Noma'lum/bo'sh" && r.operatorNames.length === 0);
  const noOneOnDuty = rows.filter(
    (r) => r.region !== "Noma'lum/bo'sh" && r.operatorNames.length > 0 && r.onDutyNames.length === 0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Viloyat qamrovi</CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Har operatorga viloyat <b>/foydalanuvchilar</b>&apos;dan biriktiriladi. Bu jadval —
          kunlik taqsimotni yoqishdan oldin (yoki keyin tekshirish uchun) qaysi viloyatda
          bo&apos;shliq borligini ko&apos;rsatadi.
        </p>
      </CardHeader>
      <CardContent className="pt-2">
        {enabled && (uncovered.length > 0 || noOneOnDuty.length > 0) && (
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {uncovered.length > 0 && (
              <span>
                {uncovered.length} ta viloyatga operator biriktirilmagan (
                {uncovered.map((r) => r.region).join(", ")}) — mijozlari umumiy hovuzga tushadi.
              </span>
            )}
            {uncovered.length > 0 && noOneOnDuty.length > 0 && <br />}
            {noOneOnDuty.length > 0 && (
              <span>
                {noOneOnDuty.length} ta viloyatning egasi bugun ishlamayapti (
                {noOneOnDuty.map((r) => r.region).join(", ")}) — bugun boshqa operatorlarga
                vaqtincha taqsimlanadi.
              </span>
            )}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-3 font-medium">Viloyat</th>
                <th className="py-2 pr-3 font-medium">Biriktirilgan operator</th>
                <th className="py-2 pr-3 font-medium">Bugun ishlaydi</th>
                <th className="py-2 text-right font-medium">Mijozlar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.region}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                    {r.region}
                  </td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                    {r.operatorNames.length > 0 ? (
                      r.operatorNames.join(", ")
                    ) : r.region === "Noma'lum/bo'sh" ? (
                      "—"
                    ) : (
                      <Badge tone="amber">biriktirilmagan</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                    {r.operatorNames.length === 0
                      ? "—"
                      : r.onDutyNames.length > 0
                        ? r.onDutyNames.join(", ")
                        : <Badge tone="slate">hech kim</Badge>}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {r.clientCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!enabled && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Viloyat bo&apos;yicha taqsimlash hozircha o&apos;chirilgan — kunlik taqsimot eski
            (umumiy hovuz) tartibda ishlayapti. Yuqoridagi jadval sozlamani yoqishga
            tayyorgarlik uchun.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
