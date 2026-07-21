import Link from "next/link";
import {
  Warehouse,
  HardHat,
  PackageCheck,
  Trash2,
  Coins,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlowChart, FlowLegend, SourceSplit } from "@/components/equipment-charts";
import {
  getEquipmentOverview,
  type EquipmentDetail,
  type RuleClient,
} from "@/lib/inventory-stats";
import { BASE_PROGRAM_USD } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Uskuna analitikasi" };

const WINDOWS = [6, 12, 24];

/** Batafsil ochiladigan kartochkalar. */
type CardKey = "ombor" | "ustalar" | "mijozlar" | "ijara" | "brak" | "zaxira";

const toneMap = {
  blue: "bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  red: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

/**
 * Bosiladigan KPI kartochkasi. Ochish/yopish URL orqali (`?kart=`) — sahifa
 * server komponentida qolаdi, orqaga tugmasi ham to'g'ri ishlaydi.
 */
function Kpi({
  cardKey,
  active,
  months,
  label,
  value,
  sub,
  icon: Icon,
  tone,
  count,
}: {
  cardKey: CardKey;
  active: CardKey | null;
  months: number;
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof toneMap;
  /** Batafsilda nechta qator bor — 0 bo'lsa kartochka bosilmaydi. */
  count: number;
}) {
  const isOpen = active === cardKey;
  const href = `/uskuna-analitika?oy=${months}${isOpen ? "" : `&kart=${cardKey}`}`;
  const body = (
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
        <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {value}
        </div>
        {sub && <div className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{sub}</div>}
      </div>
      <span className={`shrink-0 rounded-lg p-2 ${toneMap[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
    </div>
  );

  if (count === 0) {
    return (
      <Card className="p-5">
        {body}
        <div className="mt-2 text-xs text-slate-300 dark:text-slate-600">Batafsil ma'lumot yo'q</div>
      </Card>
    );
  }

  return (
    <Link href={href} scroll={false} className="block">
      <Card
        className={
          "p-5 transition hover:border-primary-300 hover:shadow-sm dark:hover:border-primary-700 " +
          (isOpen ? "border-primary-400 ring-1 ring-primary-400 dark:border-primary-600" : "")
        }
      >
        {body}
        <div className="mt-2 flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400">
          {isOpen ? (
            <>
              Yopish <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Batafsil ({count}) <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </div>
      </Card>
    </Link>
  );
}

/** Batafsil panel uchun oddiy jadval. */
function DetailTable({
  head,
  children,
  minWidth = 420,
}: {
  head: string[];
  children: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-800">
            {head.map((h, i) => (
              <th key={h} className={"pb-2 font-medium" + (i === 0 ? "" : " text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const Tr = ({ children }: { children: React.ReactNode }) => (
  <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800">{children}</tr>
);
const Td = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <td className={"py-2 text-right tabular-nums " + className}>{children}</td>
);
const TdName = ({ children }: { children: React.ReactNode }) => (
  <td className="py-2 text-slate-800 dark:text-slate-200">{children}</td>
);

const DETAIL_TITLE: Record<CardKey, string> = {
  ombor: "Omborda — texnika turlari bo'yicha",
  ustalar: "Ustalarda — kimda nima bor",
  mijozlar: "Mijozlarda — turlar va eng ko'p uskunali mijozlar",
  ijara: "Ijara daromadi — qaysi texnikadan",
  brak: "Brak — qoldiq va oxirgi chiqarilganlar",
  zaxira: "Kam zaxira — yetishmayotgan miqdor",
};

const dateFmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

/** Bosilgan KPI kartochkasining batafsil ochilishi. */
function DetailPanel({
  which,
  d,
  months,
}: {
  which: CardKey;
  d: EquipmentDetail;
  months: number;
}) {
  return (
    <Card className="border-primary-200 dark:border-primary-900">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <CardTitle>{DETAIL_TITLE[which]}</CardTitle>
        <Link
          href={`/uskuna-analitika?oy=${months}`}
          scroll={false}
          className="shrink-0 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          Yopish ✕
        </Link>
      </CardHeader>
      <CardContent>
        {which === "ombor" && (
          <DetailTable head={["Texnika", "Qoldiq", "Birlik narxi", "Qiymati", "Min. zaxira"]}>
            {d.warehouse.map((r) => (
              <Tr key={r.name}>
                <TdName>{r.name}</TdName>
                <Td className={r.low ? "font-semibold text-red-600 dark:text-red-400" : ""}>
                  {r.qty}
                </Td>
                <Td className="text-slate-500">{formatMoney(r.unitPrice, "USD")}</Td>
                <Td className="font-medium">{formatMoney(r.value, "USD")}</Td>
                <Td className="text-slate-400">{r.minStock || "—"}</Td>
              </Tr>
            ))}
          </DetailTable>
        )}

        {which === "ustalar" && (
          <div className="space-y-4">
            {d.usta.map((u) => (
              <div key={u.ustaId}>
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {u.ustaName}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {u.total} dona
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {u.items.map((i) => (
                    <span
                      key={i.name}
                      className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {i.name} × {i.qty}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {which === "mijozlar" && (
          <div className="space-y-6">
            <DetailTable head={["Texnika", "Ijarada", "Sotilgan", "Jami"]}>
              {d.client.map((r) => (
                <Tr key={r.name}>
                  <TdName>{r.name}</TdName>
                  <Td>{r.rental}</Td>
                  <Td>{r.sold}</Td>
                  <Td className="font-medium">{r.total}</Td>
                </Tr>
              ))}
            </DetailTable>
            <div>
              <h4 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                Eng ko'p uskunali mijozlar (top {d.topClients.length})
              </h4>
              <DetailTable head={["Mijoz", "Ijarada", "Sotilgan", "Jami"]}>
                {d.topClients.map((c) => (
                  <Tr key={c.id}>
                    <td className="py-2">
                      <Link
                        href={`/mijozlar/${c.id}`}
                        className="text-primary-600 hover:underline dark:text-primary-400"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <Td>{c.rental}</Td>
                    <Td>{c.sold}</Td>
                    <Td className="font-medium">{c.qty}</Td>
                  </Tr>
                ))}
              </DetailTable>
            </div>
          </div>
        )}

        {which === "ijara" && (
          <>
            <DetailTable head={["Texnika", "Ijarada (dona)", "Oylik narxi", "Jami ($/oy)", "Mijoz"]}>
              {d.rental.map((r) => (
                <Tr key={r.name}>
                  <TdName>{r.name}</TdName>
                  <Td>{r.qty}</Td>
                  <Td className="text-slate-500">{formatMoney(r.unitPrice, "USD")}</Td>
                  <Td className="font-medium text-emerald-600 dark:text-emerald-400">
                    {formatMoney(r.monthly, "USD")}
                  </Td>
                  <Td className="text-slate-400">{r.clients}</Td>
                </Tr>
              ))}
            </DetailTable>
            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
              Jami {d.rentalClientCount} ta mijozda ijara uskunasi bor. Bu summa mijozning
              oylik to'lovi ICHIDAGI ulush — MRR ustiga qo'shilmaydi.
            </p>
          </>
        )}

        {which === "brak" && (
          <div className="space-y-6">
            <DetailTable head={["Texnika", "Brakdagi qoldiq"]} minWidth={280}>
              {d.brak.map((r) => (
                <Tr key={r.name}>
                  <TdName>{r.name}</TdName>
                  <Td className="font-medium text-red-600 dark:text-red-400">{r.qty}</Td>
                </Tr>
              ))}
            </DetailTable>
            {d.brakRecent.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Oxirgi brakka chiqarishlar
                </h4>
                <DetailTable head={["Sana", "Texnika", "Soni", "Qayerdan", "Kim", "Izoh"]} minWidth={560}>
                  {d.brakRecent.map((m, i) => (
                    <Tr key={i}>
                      <td className="py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {dateFmt(m.date)}
                      </td>
                      <Td className="text-left">{m.typeName}</Td>
                      <Td>{m.qty}</Td>
                      <Td className="text-left text-slate-500">{m.from}</Td>
                      <Td className="text-left text-slate-500">{m.user}</Td>
                      <Td className="text-left text-slate-400">{m.note ?? "—"}</Td>
                    </Tr>
                  ))}
                </DetailTable>
              </div>
            )}
          </div>
        )}

        {which === "zaxira" && (
          <>
            <DetailTable head={["Texnika", "Qoldiq", "Min. zaxira", "Yetishmaydi", "90 kunda sarflandi"]}>
              {d.lowStock.map((r) => (
                <Tr key={r.name}>
                  <TdName>{r.name}</TdName>
                  <Td className="text-red-600 dark:text-red-400">{r.qty}</Td>
                  <Td className="text-slate-500">{r.minStock}</Td>
                  <Td className="font-semibold text-amber-600 dark:text-amber-400">
                    {r.deficit}
                  </Td>
                  <Td className="text-slate-400">{r.usedLast90}</Td>
                </Tr>
              ))}
            </DetailTable>
            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
              &quot;90 kunda sarflandi&quot; — ombordan chiqqan miqdor (ustaga taqsimot +
              to'g'ridan-to'g'ri o'rnatish). Buyurtma hajmini baholashga yordam beradi.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Nomuvofiq mijozlar ro'yxati — profilga havola bilan. */
function RuleList({
  title,
  hint,
  items,
  tone,
}: {
  title: string;
  hint: string;
  items: RuleClient[];
  tone: "amber" | "red";
}) {
  const border =
    tone === "red"
      ? "border-red-200 dark:border-red-900"
      : "border-amber-200 dark:border-amber-900";
  const head =
    tone === "red"
      ? "text-red-700 dark:text-red-400"
      : "text-amber-700 dark:text-amber-400";
  return (
    <Card className={border}>
      <CardHeader>
        <CardTitle className={head}>
          {title} — {items.length}
        </CardTitle>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Nomuvofiqlik topilmadi.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {items.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="py-1.5 pr-2">
                      <Link
                        href={`/mijozlar/${c.id}`}
                        className="text-primary-600 hover:underline dark:text-primary-400"
                      >
                        {c.restaurantName}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {formatMoney(c.monthlyAmount, c.currency)}
                    </td>
                    <td className="w-20 py-1.5 text-right tabular-nums text-slate-400">
                      {c.rentedQty} dona
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function UskunaAnalitikaPage({
  searchParams,
}: {
  searchParams: Promise<{ oy?: string; kart?: string }>;
}) {
  await requireRole(["ADMIN", "MANAGER"]);
  const sp = await searchParams;
  const parsed = parseInt(sp.oy ?? "12", 10);
  const months = WINDOWS.includes(parsed) ? parsed : 12;
  const CARD_KEYS: CardKey[] = ["ombor", "ustalar", "mijozlar", "ijara", "brak", "zaxira"];
  const active = CARD_KEYS.includes(sp.kart as CardKey) ? (sp.kart as CardKey) : null;

  const o = await getEquipmentOverview(months);
  const w = o.months[o.months.length - 1];
  const totalInstalled = o.months.reduce((s, m) => s + m.installed, 0);
  const totalScrap = o.months.reduce((s, m) => s + m.scrap, 0);
  const mismatchUsta = o.ustaRows.filter((r) => r.diff !== 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Uskuna analitikasi
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ombor → usta → mijoz oqimi, o'rnatish manbasi va ma'lumot sifati
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
          {WINDOWS.map((m) => (
            <Link
              key={m}
              href={`/uskuna-analitika?oy=${m}${active ? `&kart=${active}` : ""}`}
              scroll={false}
              className={
                "rounded-md px-3 py-1.5 text-sm " +
                (m === months
                  ? "bg-primary-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")
              }
            >
              {m} oy
            </Link>
          ))}
        </div>
      </div>

      {/* Joriy holat — har bir kartochka bosilganda batafsili ochiladi */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          cardKey="ombor"
          active={active}
          months={months}
          label="Omborda"
          value={`${o.warehouseUnits} dona`}
          sub={`Qiymati ${formatMoney(o.warehouseValue, "USD")}`}
          icon={Warehouse}
          tone="blue"
          count={o.detail.warehouse.length}
        />
        <Kpi
          cardKey="ustalar"
          active={active}
          months={months}
          label="Ustalarda"
          value={`${o.ustaUnits} dona`}
          sub={`${o.detail.usta.length} ta ustada`}
          icon={HardHat}
          tone="violet"
          count={o.detail.usta.length}
        />
        <Kpi
          cardKey="mijozlar"
          active={active}
          months={months}
          label="Mijozlarda"
          value={`${o.clientUnits} dona`}
          sub={`Ijara ${o.rentalUnits} · Sotuv ${o.soldUnits}`}
          icon={PackageCheck}
          tone="emerald"
          count={o.detail.client.length}
        />
        <Kpi
          cardKey="ijara"
          active={active}
          months={months}
          label="Ijara daromadi"
          value={`${formatMoney(o.monthlyRentalUsd, "USD")}/oy`}
          sub="Oylik to'lov ICHIDAGI ulush"
          icon={Coins}
          tone="emerald"
          count={o.detail.rental.length}
        />
        <Kpi
          cardKey="brak"
          active={active}
          months={months}
          label="Brak"
          value={`${o.brakUnits} dona`}
          sub={`${months} oyda ${totalScrap} ta chiqarildi`}
          icon={Trash2}
          tone={o.brakUnits > 0 ? "red" : "slate"}
          count={o.detail.brak.length + o.detail.brakRecent.length}
        />
        <Kpi
          cardKey="zaxira"
          active={active}
          months={months}
          label="Kam zaxira"
          value={String(o.lowStock.length)}
          sub={o.lowStock.map((l) => l.name).join(", ") || "Hammasi yetarli"}
          icon={AlertTriangle}
          tone={o.lowStock.length > 0 ? "amber" : "slate"}
          count={o.detail.lowStock.length}
        />
      </div>

      {active && <DetailPanel which={active} d={o.detail} months={months} />}

      {/* Oqim + manba */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Oylik oqim (oxirgi {months} oy)</CardTitle>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Bu oy: {w?.inbound ?? 0} kirim · {w?.toUsta ?? 0} ustaga · {w?.installed ?? 0}{" "}
              o'rnatildi · {w?.scrap ?? 0} brak
            </p>
          </CardHeader>
          <CardContent>
            <FlowChart months={o.months} />
            <FlowLegend />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>O'rnatish manbasi</CardTitle>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {months} oyda jami {totalInstalled} dona o'rnatildi
            </p>
          </CardHeader>
          <CardContent>
            <SourceSplit source={o.source} />
          </CardContent>
        </Card>
      </div>

      {/* Usta kesimi */}
      <Card>
        <CardHeader>
          <CardTitle>Ustalar kesimi (butun tarix)</CardTitle>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Qoldiq = olgan − o'rnatgan − qaytargan − brak. Farq 0 dan boshqa bo'lsa, qayd
            etilmagan harakat bor.
          </p>
        </CardHeader>
        <CardContent>
          {o.ustaRows.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">Faol usta yo'q</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-800">
                    <th className="pb-2 font-medium">Usta</th>
                    <th className="pb-2 text-right font-medium">Olgan</th>
                    <th className="pb-2 text-right font-medium">O'rnatgan</th>
                    <th className="pb-2 text-right font-medium">Qaytargan</th>
                    <th className="pb-2 text-right font-medium">Brak</th>
                    <th className="pb-2 text-right font-medium">Qo'lida</th>
                    <th className="pb-2 text-right font-medium">Farq</th>
                  </tr>
                </thead>
                <tbody>
                  {o.ustaRows.map((r) => (
                    <tr
                      key={r.ustaId}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="py-2 text-slate-800 dark:text-slate-200">{r.ustaName}</td>
                      <td className="py-2 text-right tabular-nums">{r.received}</td>
                      <td className="py-2 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                        {r.installed}
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.returned}</td>
                      <td className="py-2 text-right tabular-nums">{r.scrapped}</td>
                      <td className="py-2 text-right tabular-nums">{r.onHand}</td>
                      <td
                        className={
                          "py-2 text-right tabular-nums " +
                          (r.diff === 0
                            ? "text-slate-300 dark:text-slate-600"
                            : "font-semibold text-amber-600 dark:text-amber-400")
                        }
                      >
                        {r.diff === 0 ? "—" : r.diff > 0 ? `+${r.diff}` : r.diff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mismatchUsta.length > 0 && (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                  {mismatchUsta.length} ta ustada qoldiq hisobga to'g'ri kelmadi — ehtimol
                  o'rnatish yoki qaytarish tizimga kiritilmagan.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Turlar kesimi */}
      <Card>
        <CardHeader>
          <CardTitle>Texnika turlari bo'yicha taqsimot</CardTitle>
        </CardHeader>
        <CardContent>
          {o.byType.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">Ma'lumot yo'q</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-800">
                    <th className="pb-2 font-medium">Turi</th>
                    <th className="pb-2 text-right font-medium">Omborda</th>
                    <th className="pb-2 text-right font-medium">Ustalarda</th>
                    <th className="pb-2 text-right font-medium">Mijozlarda</th>
                    <th className="pb-2 text-right font-medium">Brak</th>
                  </tr>
                </thead>
                <tbody>
                  {o.byType.map((t) => (
                    <tr
                      key={t.name}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="py-2 text-slate-800 dark:text-slate-200">{t.name}</td>
                      <td className="py-2 text-right tabular-nums">{t.warehouse}</td>
                      <td className="py-2 text-right tabular-nums">{t.usta}</td>
                      <td className="py-2 text-right tabular-nums font-medium">{t.client}</td>
                      <td className="py-2 text-right tabular-nums text-slate-400">{t.brak}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 29$ qoidasi — ma'lumot sifati */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Ma'lumot sifati — ${BASE_PROGRAM_USD} qoidasi
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Oyligi aynan ${BASE_PROGRAM_USD} bo'lsa — faqat dastur, uskuna ijarasi yo'q. Undan
          ortiq bo'lsa — farq uskuna ijarasi, ya'ni mijozda ijara uskunasi bo'lishi shart.
          Tekshirildi: {o.rule.checked} ta faol USD mijoz ({o.rule.okCount} tasi to'g'ri) ·
          tashqarida: {o.rule.skippedNonUsd} so'mli, {o.rule.skippedZero} oyligi kiritilmagan.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RuleList
          title={`$${BASE_PROGRAM_USD} to'laydi, lekin uskunasi bor`}
          hint="Yoki oylik summa noto'g'ri, yoki uskuna xato biriktirilgan."
          items={o.rule.baseWithEquipment}
          tone="red"
        />
        <RuleList
          title={`$${BASE_PROGRAM_USD} dan ortiq to'laydi, uskunasi yo'q`}
          hint="Shartnomada ijara uskunasi bor — tizimga kiritilmagan. To'ldirish kerak."
          items={o.rule.aboveBaseWithoutEquipment}
          tone="amber"
        />
        <RuleList
          title={`Oyligi $${BASE_PROGRAM_USD} dan past`}
          hint="Bazaviy narxdan past — chegirma yoki summa xato kiritilgan."
          items={o.rule.belowBase}
          tone="amber"
        />
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Jami {o.totalMovements} ta harakat qayd etilgan. Batafsil jurnal va Excel eksport —{" "}
        <Link href="/ombor" className="text-primary-600 hover:underline dark:text-primary-400">
          Ombor
        </Link>{" "}
        sahifasida.
      </p>
    </div>
  );
}
