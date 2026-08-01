import Link from "next/link";
import { ClipboardList, Wallet, Copy } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { BASE_PROGRAM_USD } from "@/lib/constants";
import {
  loadIncompleteClients,
  loadPaymentProblems,
  loadRefusedButActive,
} from "@/lib/problem-clients";
import { loadDuplicateGroups } from "@/lib/duplicates-data";
import { IncompleteTable } from "@/components/incomplete-table";
import { PaymentProblemList, type ProblemBucket } from "@/components/payment-problem-list";
import { DuplicateGroups } from "@/components/duplicate-groups";
import { RefusedActiveFix } from "@/components/refused-active-fix";

// Uch bo'lim bitta manzilda: tanlov URL da turadi, ya'ni havolani ulashsa ham,
// tuzatishdan keyin sahifa yangilansa ham xuddi shu bo'lim ochiladi.
const TABS = [
  { key: "malumot", label: "Ma'lumoti to'liq emas", icon: ClipboardList },
  { key: "tolov", label: "To'lov / ijara", icon: Wallet },
  { key: "dublikat", label: "Dublikatlar", icon: Copy },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const isTab = (v: string | undefined): v is TabKey =>
  TABS.some((t) => t.key === v);

type SearchParams = Promise<{ bolim?: string }>;

export default async function ProblemClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireRole(["ADMIN", "OPERATOR", "MANAGER"]);
  const canDelete = session.role === "ADMIN" || session.role === "MANAGER";
  const sp = await searchParams;
  const tab: TabKey = isTab(sp.bolim) ? sp.bolim : "malumot";

  // Sonlar tab satrida doim ko'rinadi, shuning uchun uchala manba ham
  // yuklanadi. Faol tab uchun to'liq ma'lumot, qolganlari uchun faqat son
  // kerak — lekin dublikat/qoida hisoblashi baribir butun ro'yxatni talab
  // qiladi, alohida "count" so'rovi yutuq bermaydi.
  const [incomplete, rule, dupGroups, refusedActive] = await Promise.all([
    loadIncompleteClients(),
    loadPaymentProblems(),
    loadDuplicateGroups(),
    loadRefusedButActive(),
  ]);

  const buckets: ProblemBucket[] = [
    {
      key: "above",
      title: `$${BASE_PROGRAM_USD} dan ortiq to'laydi, ijara uskunasi yo'q`,
      hint: "Farq — uskuna ijarasi. Shartnomada uskuna bor, tizimga kiritilmagan: mijoz kartasidan biriktiring.",
      tone: "amber",
      items: rule.aboveBaseWithoutEquipment,
      showExpected: true,
    },
    {
      key: "base",
      title: `Aynan $${BASE_PROGRAM_USD} to'laydi, lekin ijara uskunasi bor`,
      hint: "Yoki oylik summa eskirgan, yoki uskuna xato biriktirilgan (sotuvni ijara deb yozilgan bo'lishi mumkin).",
      tone: "red",
      items: rule.baseWithEquipment,
    },
    {
      key: "below",
      title: `Oyligi $${BASE_PROGRAM_USD} dan past`,
      hint: "Bazaviy narxdan past — kelishilgan chegirma yoki summa xato kiritilgan.",
      tone: "amber",
      items: rule.belowBase,
    },
    {
      key: "zero",
      title: "Oylik to'lov kiritilmagan",
      hint: "Summa 0 — mijoz hisob-kitobga umuman kirmaydi (MRR, qarzdorlik, ijara — hammasi noto'g'ri chiqadi).",
      tone: "red",
      items: rule.zeroAmount,
    },
  ];

  const paymentCount = buckets.reduce((n, b) => n + b.items.length, 0);
  const counts: Record<TabKey, number> = {
    malumot: incomplete.length,
    tolov: paymentCount,
    dublikat: dupGroups.length,
  };
  const total = counts.malumot + counts.tolov + counts.dublikat;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Muammoli mijozlar
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {total === 0
            ? "Muammo topilmadi — barcha mijoz yozuvlari to'liq va izchil."
            : `Tuzatish kerak bo'lgan ${total} ta holat. Ro'yxatlar dinamik — tuzatilgan mijoz o'zi chiqib ketadi.`}
        </p>
      </div>

      {/* Holat nomuvofiqligi — uchala tabdagi sonlarga ham ta'sir qiladi,
          shuning uchun tab tanlovidan tashqarida, doim tepada turadi. */}
      <RefusedActiveFix rows={refusedActive.clients} mrr={refusedActive.mrr} />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === tab;
          const n = counts[t.key];
          return (
            <Link
              key={t.key}
              href={`/muammoli-mijozlar?bolim=${t.key}`}
              className={
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors " +
                (active
                  ? "border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-950/40 dark:text-primary-300"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800")
              }
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              <span
                className={
                  "rounded-full px-1.5 py-0.5 text-xs font-semibold " +
                  (n === 0
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100")
                }
              >
                {n}
              </span>
            </Link>
          );
        })}
      </div>

      {tab === "malumot" && (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Telefon, restoran nomi yoki viloyati to&apos;ldirilmagan mijozlar. Joyida
            to&apos;ldiring — qolgan maydonlar uchun &quot;Tahrir&quot;.
          </p>
          <IncompleteTable clients={incomplete} />
        </>
      )}

      {tab === "tolov" && (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Oyligi aynan ${BASE_PROGRAM_USD} bo&apos;lsa — faqat dastur, uskuna ijarasi
            yo&apos;q. Undan ortiq bo&apos;lsa — farq uskuna ijarasi, ya&apos;ni mijozda
            ijara uskunasi bo&apos;lishi shart. Tekshirildi: {rule.checked} ta faol USD
            mijoz ({rule.okCount} tasi to&apos;g&apos;ri) · tashqarida:{" "}
            {rule.skippedNonUsd} so&apos;mli mijoz.
          </p>
          <PaymentProblemList buckets={buckets} baseUsd={BASE_PROGRAM_USD} />
        </>
      )}

      {tab === "dublikat" && (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Bir xil telefon, shartnoma yoki nomga ega, ehtimoliy takrorlangan yozuvlar.{" "}
            {canDelete
              ? "Tekshirib, keraksiz nusxani \"O'chirish\" tugmasi bilan o'chiring — aslini qoldiring."
              : "Tekshirib, keraksiz nusxani boshliq/adminga o'chirtiring."}
          </p>
          <DuplicateGroups groups={dupGroups} canDelete={canDelete} />
        </>
      )}
    </div>
  );
}
