"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  AlertCircle,
  Phone,
  Wrench,
  PackageCheck,
  PlayCircle,
  Undo2,
} from "lucide-react";
import { TicketTabs } from "@/components/ticket-tabs";
import { EmptyState } from "@/components/empty-state";
import {
  SearchInput,
  RegionSelect,
  FoundCount,
  matchesQuery,
  uniqueRegions,
} from "@/components/list-filter";
import {
  approveReturnRequest,
  rejectReturnRequest,
  startReturnProgress,
  confirmReturnCollected,
  revertReturnRequest,
} from "@/actions/equipment";
import { Button } from "@/components/ui/button";
import { ClientLink } from "@/components/client-link";
import { Badge } from "@/components/ui/badge";
import { confirmDialog, confirmWithNote } from "@/components/confirm-dialog";
import { PhoneCopyButton } from "@/components/phone-copy";
import { SpecialNoteBell } from "@/components/special-note-bell";
import { formatDate, formatPhone, normalizePhone } from "@/lib/utils";

export type ReturnQueueItem = {
  id: string;
  status: string; // PENDING | APPROVED | IN_PROGRESS | DONE
  clientId: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  region: string | null;
  specialNote: string | null;
  specialNoteBy: string | null;
  specialNoteAt: string | null;
  note: string | null; // ariza sababi
  resolutionNote: string | null; // yakunlash/rad etish izohi
  byName: string | null;
  ustaName: string | null; // biriktirilgan usta
  ustaPhone: string | null; // TP xodimi usta bilan bog'lanishi uchun
  matchedUstaId: string | null; // viloyat bo'yicha taklif (PENDING)
  staffId: string | null; // biriktirilgan mas'ul TP xodim
  staffName: string | null;
  matchedStaffId: string | null; // mijozning joriy operatori — taklif (PENDING)
  resolvedAt: string | null; // DONE — uskuna qaytarilgan sana
};

export type UstaOpt = { id: string; name: string };
export type StaffOpt = { id: string; name: string };

// Bosqichlar — yuqorida yonma-yon TAB sifatida (eskalatsiya/muammolar bilan
// bir xil naqsh). Ilgari to'rttasi ustma-ust bo'lim edi: uzun ro'yxatda
// keraklisini topish uchun sahifani aylantirish kerak bo'lardi.
const SECTIONS: {
  status: string;
  title: string;
  hint: string;
  tone: "red" | "amber" | "sky" | "emerald";
  icon: React.ReactNode;
}[] = [
  {
    status: "PENDING",
    title: "Yangi",
    hint: "Usta biriktirilishi kutilmoqda",
    tone: "red",
    icon: <AlertCircle className="h-4 w-4" />,
  },
  {
    status: "APPROVED",
    title: "Biriktirildi",
    hint: "Usta biriktirildi — jarayonni boshlang",
    tone: "sky",
    icon: <Wrench className="h-4 w-4" />,
  },
  {
    status: "IN_PROGRESS",
    title: "Jarayonda",
    hint: "Usta yo'lda — uskuna olib kelingach yakunlang",
    tone: "amber",
    icon: <PlayCircle className="h-4 w-4" />,
  },
  {
    status: "DONE",
    title: "Qaytarildi",
    hint: "Yakunlangan arizalar (oxirgi 50 ta)",
    tone: "emerald",
    icon: <PackageCheck className="h-4 w-4" />,
  },
];

export function ReturnQueue({
  items,
  ustalar,
  staffOptions,
  canAssign,
}: {
  items: ReturnQueueItem[];
  ustalar: UstaOpt[];
  staffOptions: StaffOpt[];
  canAssign: boolean; // ADMIN/MANAGER — usta biriktirish va rad etish
}) {
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");

  const regions = useMemo(() => uniqueRegions(items), [items]);
  // Ish qayerda bo'lsa — o'sha tab ochiladi (yangi → biriktirildi → jarayonda);
  // hammasi bo'sh bo'lsa "Qaytarildi" tarixi.
  const initialTab = useMemo(() => {
    const firstWithWork = SECTIONS.find(
      (sec) => sec.status !== "DONE" && items.some((r) => r.status === sec.status),
    );
    return firstWithWork?.status ?? "DONE";
  }, [items]);
  const filtered = useMemo(
    () =>
      items.filter(
        (r) =>
          (!region || r.region === region) &&
          matchesQuery(query, r.restaurantName + " " + r.fullName, r.phone),
      ),
    [items, query, region],
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={PackageCheck}
        title="Qaytariladigan uskunalar navbati bo'sh"
        hint="Operator lid holatini «Uskuna qaytarish kerak» qilsa, bu yerda paydo bo'ladi."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} />
        <div className="flex flex-wrap items-center gap-2">
          <RegionSelect value={region} onChange={setRegion} regions={regions} />
          <FoundCount found={filtered.length} total={items.length} />
        </div>
      </div>
      {err && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {err}
        </div>
      )}
      <TicketTabs
        initialKey={initialTab}
        tabs={SECTIONS.map((sec) => {
          const rows = filtered.filter((r) => r.status === sec.status);
          return {
            key: sec.status,
            label: sec.title,
            icon: sec.icon,
            tone: sec.tone,
            // Hisoblagich filtrdan MUSTAQIL — tab tanlashda umumiy holat ko'rinsin
            count: items.filter((r) => r.status === sec.status).length,
            content: (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">{sec.hint}</p>
                {rows.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    Bu bosqichda ariza yo'q
                  </p>
                ) : (
                  rows.map((r) => (
                    <Row
                      key={r.id}
                      r={r}
                      ustalar={ustalar}
                      staffOptions={staffOptions}
                      canAssign={canAssign}
                      onError={setErr}
                    />
                  ))
                )}
              </div>
            ),
          };
        })}
      />
    </div>
  );
}

function Row({
  r,
  ustalar,
  staffOptions,
  canAssign,
  onError,
}: {
  r: ReturnQueueItem;
  ustalar: UstaOpt[];
  staffOptions: StaffOpt[];
  canAssign: boolean;
  onError: (e: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ustaId, setUstaId] = useState<string>(r.matchedUstaId ?? "");
  const [staffId, setStaffId] = useState<string>(r.matchedStaffId ?? "");
  const [assignNote, setAssignNote] = useState<string>("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    onError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else onError(res.error ?? "Xatolik");
    });
  }

  const hasUsta = r.status === "APPROVED" || r.status === "IN_PROGRESS" || r.status === "DONE";
  const done = r.status === "DONE";

  // Yakunlash — uskuna omborga (usta zaxirasiga) o'tadigan jiddiy amal, izoh MAJBURIY.
  async function onCollect() {
    const { ok, note } = await confirmWithNote({
      title: "Uskuna qaytarib olindi",
      message: `"${r.restaurantName || r.fullName}" ijara uskunalari ${
        r.ustaName ?? "usta"
      } zaxirasiga o'tkaziladi.`,
      confirmLabel: "Bajarildi",
      variant: "primary",
      note: {
        label: "Yakunlash izohi",
        placeholder: "Masalan: printer shikastlangan holda qaytdi",
        required: true,
      },
    });
    if (ok) run(() => confirmReturnCollected(r.id, note));
  }

  // "Jarayonga o'tkazish" = ustaga xabar berildi — izoh MAJBURIY.
  async function onStartProgress() {
    const { ok, note } = await confirmWithNote({
      title: "Ustaga xabar berildi",
      message: `"${r.restaurantName || r.fullName}" bo'yicha ${r.ustaName ?? "usta"}ga xabar berildi va jarayon boshlandi.`,
      confirmLabel: "Jarayonga o'tkazish",
      variant: "primary",
      note: {
        label: "Ustaga qanday xabar berildi",
        placeholder: "Masalan: qo'ng'iroq qildim, ertaga boradi",
        required: true,
      },
    });
    if (ok) run(() => startReturnProgress(r.id, note));
  }

  async function onReject() {
    const { ok, note } = await confirmWithNote({
      title: "Arizani rad etish",
      message: `"${r.restaurantName || r.fullName}" uchun qaytarish arizasi rad etilsinmi?`,
      confirmLabel: "Rad etish",
      note: { label: "Rad etish sababi", placeholder: "Masalan: mijoz fikridan qaytdi", required: true },
    });
    if (ok) run(() => rejectReturnRequest(r.id, note));
  }

  async function onRevert(message: string) {
    const ok = await confirmDialog({
      title: "Orqaga qaytarish",
      message,
      confirmLabel: "Orqaga qaytarish",
    });
    if (ok) run(() => revertReturnRequest(r.id));
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ClientLink id={r.clientId} name={r.restaurantName || r.fullName || "—"} />
            <SpecialNoteBell
              clientId={r.clientId}
              restaurantName={r.restaurantName || r.fullName}
              note={r.specialNote}
              noteBy={r.specialNoteBy}
              noteAt={r.specialNoteAt}
            />
            <Badge tone="slate">{r.region ?? "viloyatsiz"}</Badge>
            {r.status === "APPROVED" && <Badge tone="blue">Biriktirildi</Badge>}
            {r.status === "IN_PROGRESS" && <Badge tone="amber">Jarayonda</Badge>}
            {done && <Badge tone="green">Qaytarildi</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
            <span>{r.fullName}</span>
            <span className="inline-flex items-center gap-1">
              <a href={`tel:${normalizePhone(r.phone)}`} className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400">
                <Phone className="h-3 w-3" /> {formatPhone(r.phone)}
              </a>
              <PhoneCopyButton phone={r.phone} />
            </span>
            <span>· Ariza: {r.byName ?? "—"}</span>
            {done && r.resolvedAt && (
              <span>· Qaytarildi: {formatDate(r.resolvedAt)}</span>
            )}
          </div>
          {r.note && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{r.note}</p>}
          {r.resolutionNote && (
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
              Yakun izohi: {r.resolutionNote}
            </p>
          )}
          {hasUsta && (
            <p className="mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-700 dark:text-emerald-300">
              <span className="inline-flex items-center gap-1">
                <Wrench className="h-3 w-3" /> Usta: {r.ustaName ?? "—"}
              </span>
              {r.staffName && (
                <span className="inline-flex items-center gap-1">
                  · Mas'ul: {r.staffName}
                </span>
              )}
              {!done && r.ustaPhone && (
                <span className="inline-flex items-center gap-1">
                  <a
                    href={`tel:${normalizePhone(r.ustaPhone)}`}
                    className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400"
                  >
                    <Phone className="h-3 w-3" /> {formatPhone(r.ustaPhone)}
                  </a>
                  <PhoneCopyButton phone={r.ustaPhone} />
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {r.status === "DONE" ? null : r.status === "IN_PROGRESS" ? (
            <>
              <Button size="sm" disabled={pending} onClick={onCollect}>
                <PackageCheck className="h-4 w-4" /> Bajarildi (olib keldi)
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  onRevert(
                    `"${r.restaurantName || r.fullName}" — jarayon bekor qilinib, "Biriktirildi" bosqichiga qaytarilsinmi?`,
                  )
                }
              >
                <Undo2 className="h-4 w-4" /> Orqaga qaytarish
              </Button>
            </>
          ) : r.status === "APPROVED" ? (
            <>
              <Button size="sm" disabled={pending} onClick={onStartProgress}>
                <PlayCircle className="h-4 w-4" /> Jarayonga o'tkazish
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={onCollect}>
                <PackageCheck className="h-4 w-4" /> Bajarildi (olib keldi)
              </Button>
              {canAssign && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    onRevert(
                      `"${r.restaurantName || r.fullName}" uchun operator/usta biriktiruvi bekor qilinib, "Yangi" bosqichiga qaytarilsinmi?`,
                    )
                  }
                >
                  <Undo2 className="h-4 w-4" /> Orqaga qaytarish
                </Button>
              )}
            </>
          ) : !canAssign ? (
            <Badge tone="amber">Operator/usta biriktirilishi kutilmoqda</Badge>
          ) : (
            <>
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <select
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value)}
                    className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"
                  >
                    <option value="">Operator tanlang</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <select
                    value={ustaId}
                    onChange={(e) => setUstaId(e.target.value)}
                    className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"
                  >
                    <option value="">Usta tanlang (yoki viloyat bo'yicha)</option>
                    {ustalar.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                  placeholder="Izoh (majburiy) — operator/usta bilan qanday kelishildi"
                  rows={2}
                  className="w-full min-w-[220px] resize-y rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                />
                <Button
                  size="sm"
                  disabled={pending || !staffId || !ustaId || !assignNote.trim()}
                  onClick={() => run(() => approveReturnRequest(r.id, staffId, ustaId, assignNote))}
                >
                  <Check className="h-4 w-4" /> Biriktirish
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
                disabled={pending}
                onClick={onReject}
              >
                <X className="h-4 w-4" /> Rad etish
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  onRevert(
                    `"${r.restaurantName || r.fullName}" uchun qaytarish arizasi butunlay bekor qilinsinmi? Bu ariza ro'yxatdan o'chadi.`,
                  )
                }
              >
                <Undo2 className="h-4 w-4" /> Orqaga qaytarish
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
