import { ClientQuickView } from "@/components/client-quick-view";
import {
  Phone,
  Wrench,
  DownloadCloud,
  Inbox,
  UserCheck,
  HardHat,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
  TicketTypeBadge,
} from "@/components/status-badge";
import { TicketFilter } from "@/components/ticket-filter";
import { TicketStatusControl } from "@/components/ticket-status-control";
import { TicketDismissButton } from "@/components/ticket-dismiss-button";
import { TicketIntegratorControl } from "@/components/ticket-integrator-control";
import { VersionTicketStatusControl } from "@/components/version-ticket-status-control";
import { VersionAssigneeControl } from "@/components/version-assignee-control";
import { TicketForm } from "@/components/ticket-form";
import { TicketTabs, type TicketTab } from "@/components/ticket-tabs";
import { PhoneCopyButton } from "@/components/phone-copy";
import { SpecialNoteBell } from "@/components/special-note-bell";
import { EmptyState } from "@/components/empty-state";
import { TICKET_TYPE, TICKET_PRIORITY } from "@/lib/constants";
import { formatDate, formatPhone, normalizePhone } from "@/lib/utils";
import { slaThreshold } from "@/lib/sla";
import { tzDayStartFromInput } from "@/lib/tz";
import { assignedStaffScope, isManagerRole } from "@/lib/visibility";
import type { Bolim } from "./section-tabs";

// Hal qilingan bo'limida ko'rsatiladigan maksimal karta (tarix o'smasin).
const RESOLVED_RENDER_CAP = 30;

// Ustuvorlik bo'yicha kartaning chap-chekka rangi.
const PRIORITY_ACCENT: Record<string, string> = {
  HIGH: "border-l-red-400 dark:border-l-red-500",
  MEDIUM: "border-l-amber-300 dark:border-l-amber-500",
  LOW: "border-l-slate-200 dark:border-l-slate-700",
};

export async function TicketsSection({
  session,
  bolim = "muammo",
  type,
  priority,
  assignee,
  usta,
  resolveType,
  from,
  to,
  q,
}: {
  session: SessionPayload;
  /** "versiya" bo'lsa turi "Yangi versiya"ga qulflanadi (filtr ko'rsatilmaydi). */
  bolim?: Bolim;
  type?: string;
  priority?: string;
  assignee?: string;
  usta?: string;
  resolveType?: string;
  from?: string;
  to?: string;
  q?: string;
}) {
  const isVersion = bolim === "versiya";
  // "Muammolar" bo'limida "Yangi versiya" turi tanlanmaydi (o'z sub-bo'limi bor).
  const selectableTypes = Object.entries(TICKET_TYPE).filter(
    ([k]) => isVersion || k !== "VERSION_UPDATE",
  );
  const canAssign = isManagerRole(session.role);

  // Ustaga biriktirish/olib tashlash — boshliq/admin ISTALGANini, mas'ul TP
  // xodim (OPERATOR) esa faqat O'ZIGA (assignedStaffId) biriktirilgan
  // muammoni/so'rovni — eskalatsiyadagi `assignUsta` bilan bir xil naqsh.
  function canAssignUstaFor(assignedStaffId: string | null): boolean {
    return canAssign || assignedStaffId === session.userId;
  }

  // TP xodim (OPERATOR) faqat o'ziga maxsus xodim qilib biriktirilgan
  // muammolarni ko'radi; ADMIN/MANAGER esa barchasini (va biriktiradi).
  const scope = assignedStaffScope(
    session.role,
    session.userId,
    "assignedStaffId",
  );

  // Filtr shartlari — ham ro'yxatga, ham tab sonlariga BIR XIL qo'llanadi.
  // AND massivida saqlanadi: mas'ul filtri OR ishlatgani uchun bo'lim
  // scope'laridagi (Yangi/Biriktirilgan) OR bilan to'qnashmasin.
  const filterAnd: Prisma.TicketWhereInput[] = [];
  // "Yangi versiya" bo'limida turi har doim VERSION_UPDATE'ga qulflangan —
  // URL orqali (masalan eski havola) boshqa turi kirib qolsa ham e'tiborsiz.
  // "Muammolar" bo'limida esa VERSION_UPDATE hech qachon ko'rinmaydi — u o'z
  // sub-bo'limiga ega (aks holda ikkalasida ham dublikat ko'rinardi).
  if (isVersion) filterAnd.push({ type: "VERSION_UPDATE" });
  else
    filterAnd.push({
      type:
        type && type !== "VERSION_UPDATE" ? type : { not: "VERSION_UPDATE" },
    });
  if (priority) filterAnd.push({ priority });
  // Mas'ul xodim bo'yicha filtr — faqat boshqaruv rollari uchun.
  if (assignee && canAssign) {
    filterAnd.push({ assignedStaffId: assignee });
  }
  if (usta) filterAnd.push({ assignedUstaId: usta });
  if (resolveType) filterAnd.push({ assigneeType: resolveType });
  const fromDate = tzDayStartFromInput(from);
  if (fromDate) filterAnd.push({ createdAt: { gte: fromDate } });
  const toDate = tzDayStartFromInput(to);
  if (toDate)
    filterAnd.push({
      createdAt: { lt: new Date(toDate.getTime() + 86400000) },
    });
  if (q) {
    const digits = q.replace(/\D/g, "");
    filterAnd.push({
      client: {
        OR: [
          { restaurantName: { contains: q, mode: "insensitive" } },
          { fullName: { contains: q, mode: "insensitive" } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        ],
      },
    });
  }

  const where: Prisma.TicketWhereInput = { ...scope, AND: filterAnd };

  // Bo'lim (Yangi/TP xodimiga biriktirildi/Ustaga yetkazildi/Hal) sanog'i —
  // endi filtrga MOS (turi/ustuvorlik/mas'ul tanlanganda tab sonlari ham
  // shunga qarab o'zgaradi). Ketma-ketlik: mas'ul xodim biriktirilmaguncha
  // "yangi", biriktirilgach "xodimga", usta ham qo'shilgach "ustaga".
  const unassignedScope: Prisma.TicketWhereInput = {
    ...scope,
    AND: filterAnd,
    status: { not: "RESOLVED" },
    assignedStaffId: null,
    assignedUstaId: null,
  };
  const staffOnlyScope: Prisma.TicketWhereInput = {
    ...scope,
    AND: filterAnd,
    status: { not: "RESOLVED" },
    assignedStaffId: { not: null },
    assignedUstaId: null,
  };
  const withUstaScope: Prisma.TicketWhereInput = {
    ...scope,
    AND: filterAnd,
    status: { not: "RESOLVED" },
    assignedUstaId: { not: null },
  };

  const [
    ticketsRaw,
    clients,
    xodimlar,
    ustalarFull,
    yangiTotal,
    staffOnlyTotal,
    ustaTotal,
    halTotal,
    slaBreached,
  ] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          select: {
            id: true,
            restaurantName: true,
            fullName: true,
            phone: true,
            specialNote: true,
            specialNoteAt: true,
            specialNoteBy: { select: { name: true } },
            // Eng so'nggi bir nechtasi: birinchisi (calledAt bo'yicha) "oxirgi
            // harakat sanasi"ga, izohli birinchisi "oxirgi izoh"ga ishlatiladi.
            callLogs: {
              orderBy: { calledAt: "desc" },
              take: 5,
              select: {
                note: true,
                calledAt: true,
                operator: { select: { name: true } },
              },
            },
          },
        },
        assignedTo: { select: { name: true } },
        assignedUsta: { select: { id: true, name: true, phone: true } },
        assignedStaff: { select: { id: true, name: true, phone: true } },
      },
    }),
    db.client.findMany({
      select: { id: true, restaurantName: true, fullName: true },
      orderBy: { restaurantName: "asc" },
    }),
    db.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER", "OPERATOR"] }, isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { role: "INSTALLER", isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    db.ticket.count({ where: unassignedScope }),
    db.ticket.count({ where: staffOnlyScope }),
    db.ticket.count({ where: withUstaScope }),
    db.ticket.count({
      where: { ...scope, AND: filterAnd, status: "RESOLVED" },
    }),
    db.ticket.count({
      where: {
        ...scope,
        AND: filterAnd,
        status: { not: "RESOLVED" },
        createdAt: { lt: slaThreshold() },
      },
    }),
  ]);

  // Ko'rsatilayotgan (filtrlangan) ticketlarni to'rt bosqichga ajratamiz:
  // Yangi → TP xodimiga biriktirildi → Ustaga yetkazildi → Hal qilindi.
  const yangi = ticketsRaw.filter(
    (t) => t.status !== "RESOLVED" && !t.assignedStaffId && !t.assignedUstaId,
  );
  const staffAssigned = ticketsRaw.filter(
    (t) => t.status !== "RESOLVED" && t.assignedStaffId && !t.assignedUstaId,
  );
  const withUsta = ticketsRaw.filter(
    (t) => t.status !== "RESOLVED" && t.assignedUstaId,
  );
  // "Yangi versiya"da mas'ul XOH xodim, XOH usta bo'lishi mumkin — bitta
  // bosqich (`VersionAssigneeControl` bir vaqtda faqat bittasini yozadi, shu
  // bois o'zaro eksklyuziv — birlashtirish xavfsiz).
  const assignedActive = isVersion
    ? ticketsRaw.filter(
        (t) =>
          t.status !== "RESOLVED" && (t.assignedStaffId || t.assignedUstaId),
      )
    : staffAssigned;
  const hal = ticketsRaw.filter((t) => t.status === "RESOLVED");

  const openCount = yangiTotal + staffOnlyTotal + ustaTotal;
  const hasFilter = !!(
    (!isVersion && type) ||
    priority ||
    assignee ||
    usta ||
    resolveType ||
    from ||
    to ||
    q
  );

  // Bitta ticket kartasi — barcha tab'larda bir xil.
  function ticketCard(t: (typeof ticketsRaw)[number]) {
    const lastAction = t.client.callLogs[0] ?? null;
    const lastNote = t.client.callLogs.find((l) => l.note) ?? null;
    // Ochilgandan keyin biror harakat bo'lgan bo'lsa (biriktirish/holat
    // o'zgarishi) alohida ko'rsatamiz — bo'lmasa "Ochilgan" bilan bir xil
    // sanani takrorlamaymiz.
    const lastActionAt =
      lastAction && lastAction.calledAt.getTime() !== t.createdAt.getTime()
        ? lastAction.calledAt
        : null;
    return (
      <Card
        key={t.id}
        className={`border-l-4 p-4 ${PRIORITY_ACCENT[t.priority] ?? PRIORITY_ACCENT.LOW}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-slate-100">
              {t.title}
            </div>
            <span className="inline-flex items-center gap-1.5">
              <ClientQuickView
                id={t.client.id}
                name={t.client.restaurantName}
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700"
              />
              <SpecialNoteBell
                clientId={t.client.id}
                restaurantName={t.client.restaurantName || t.client.fullName}
                note={t.client.specialNote}
                noteBy={t.client.specialNoteBy?.name ?? null}
                noteAt={
                  t.client.specialNoteAt
                    ? t.client.specialNoteAt.toISOString()
                    : null
                }
              />
            </span>
            <span className="text-sm text-slate-400 dark:text-slate-500">
              {" "}
              · {t.client.fullName}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <TicketTypeBadge type={t.type} />
            <TicketPriorityBadge priority={t.priority} />
            <TicketStatusBadge status={t.status} />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
          <span>Ochilgan: {formatDate(t.createdAt)}</span>
          {lastActionAt && (
            <span>· Oxirgi harakat: {formatDate(lastActionAt)}</span>
          )}
          {t.status === "RESOLVED" && t.resolvedAt && (
            <span>· Hal qilindi: {formatDate(t.resolvedAt)}</span>
          )}
          {t.assignedStaff && <span>· mas'ul: {t.assignedStaff.name}</span>}
          {t.assignedUsta && <span>· usta: {t.assignedUsta.name}</span>}
          <span className="inline-flex items-center gap-1">
            ·
            <a
              href={`tel:${normalizePhone(t.client.phone)}`}
              className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400"
            >
              <Phone className="h-3 w-3" />
              {formatPhone(t.client.phone)}
            </a>
            <PhoneCopyButton phone={t.client.phone} />
          </span>
        </div>

        {lastNote?.note && (
          <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <span className="font-medium">Oxirgi izoh:</span> {lastNote.note}
            <span className="ml-1 text-xs text-amber-700/70 dark:text-amber-300/70">
              ({formatDate(lastNote.calledAt)}
              {lastNote.operator ? ` · ${lastNote.operator.name}` : ""})
            </span>
          </div>
        )}

        {t.resolutionNote && (
          <div className="mt-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
            Yechim: {t.resolutionNote}
          </div>
        )}

        <div className="mt-3">
          {isVersion ? (
            <VersionAssigneeControl
              ticketId={t.id}
              canAssignStaff={canAssign}
              canAssignUsta={canAssignUstaFor(t.assignedStaffId)}
              staff={t.assignedStaff ?? null}
              staffNote={t.staffNote}
              usta={t.assignedUsta ?? null}
              ustaNote={t.ustaNote}
              xodimlar={xodimlar}
              ustalar={ustalarFull}
            />
          ) : (
            <TicketIntegratorControl
              ticketId={t.id}
              canAssignStaff={canAssign}
              canAssignUsta={canAssignUstaFor(t.assignedStaffId)}
              staff={t.assignedStaff ?? null}
              staffNote={t.staffNote}
              xodimlar={xodimlar}
              usta={t.assignedUsta ?? null}
              ustaNote={t.ustaNote}
              ustalar={ustalarFull}
            />
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isVersion ? (
            <VersionTicketStatusControl
              ticketId={t.id}
              status={t.status}
              blocked={t.blocked}
              blockedNote={t.blockedNote}
            />
          ) : (
            <TicketStatusControl ticketId={t.id} status={t.status} />
          )}
          {/* Xato ochilgan muammoni boshliq bir bosishda yopadi */}
          {canAssign && t.status !== "RESOLVED" && (
            <TicketDismissButton ticketId={t.id} title={t.title} />
          )}
        </div>
      </Card>
    );
  }

  // Bo'lim ichi: bo'sh bo'lsa nozik ko'rsatkich, aks holda kartalar ro'yxati.
  function panel(
    items: typeof ticketsRaw,
    emptyHint: string,
    resolved = false,
  ) {
    if (items.length === 0) {
      return (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-800 dark:text-slate-500">
          {emptyHint}
        </p>
      );
    }
    const shown = resolved ? items.slice(0, RESOLVED_RENDER_CAP) : items;
    return (
      <div className="space-y-3">
        {shown.map(ticketCard)}
        {resolved && items.length > RESOLVED_RENDER_CAP && (
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            Yana {items.length - RESOLVED_RENDER_CAP} ta hal qilingan muammo
            (filtr bilan toraytiring)
          </p>
        )}
      </div>
    );
  }

  // Bosqichlar: "Muammolar" — Yangi → TP xodimiga biriktirildi → Ustaga
  // yetkazildi → Hal qilindi. "Yangi versiya" — usta bosqichi yo'q (joyida
  // hal etish talab qilinmaydi): Yangi → TP xodimiga biriktirildi → Versiya
  // yangilandi. OPERATOR "Yangi"ni ko'rmaydi — scope ularga faqat o'ziga
  // biriktirilganlarni beradi, shuning uchun bo'sh tab foydasiz bo'lardi.
  const tabs: TicketTab[] = [];
  if (canAssign) {
    tabs.push({
      key: "yangi",
      label: "Yangi",
      icon: <Inbox className="h-4 w-4" />,
      tone: "red", // yangi tushgan muammolar — qizil (e'tibor talab qiladi)
      count: yangiTotal,
      content: panel(
        yangi,
        isVersion
          ? "Yangi versiya so'rovi yo'q."
          : "Biriktirilmagan yangi muammo yo'q.",
      ),
    });
  }
  tabs.push({
    key: "xodimga",
    label: isVersion ? "Biriktirildi" : "TP xodimiga biriktirildi",
    icon: <UserCheck className="h-4 w-4" />,
    // Admin/menejerda sariq (nazorat), xodimda qizil (bajarilishi kutilmoqda)
    tone: canAssign ? "amber" : "red",
    count: isVersion ? staffOnlyTotal + ustaTotal : staffOnlyTotal,
    content: panel(
      assignedActive,
      isVersion
        ? canAssign
          ? "Biriktirilgan versiya so'rovi yo'q."
          : "Sizga biriktirilgan versiya so'rovi yo'q."
        : canAssign
          ? "TP xodimiga biriktirilgan (ustaga yetkazilmagan) muammo yo'q."
          : "Sizga biriktirilgan, ustaga yetkazilmagan muammo yo'q.",
    ),
  });
  if (!isVersion) {
    tabs.push({
      key: "ustaga",
      label: "Ustaga yetkazildi",
      icon: <HardHat className="h-4 w-4" />,
      tone: "sky",
      count: ustaTotal,
      content: panel(withUsta, "Ustaga yetkazilgan muammo yo'q."),
    });
  }
  tabs.push({
    key: "hal",
    label: isVersion ? "Versiya yangilandi" : "Hal qilingan",
    icon: isVersion ? (
      <DownloadCloud className="h-4 w-4" />
    ) : (
      <CheckCircle2 className="h-4 w-4" />
    ),
    tone: "emerald",
    count: halTotal,
    content: panel(
      hal,
      isVersion
        ? "Versiyasi yangilangan so'rov yo'q."
        : "Hal qilingan muammo yo'q.",
      true,
    ),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {openCount} ta ochiq · {halTotal} ta{" "}
          {isVersion ? "versiya yangilangan" : "hal qilingan"}
        </p>
        {slaBreached > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" />
            {slaBreached} ta 3 kundan oshgan
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div
          className={`space-y-5 ${canAssign ? "lg:col-span-2" : "lg:col-span-3"}`}
        >
          <Card className="p-4">
            <TicketFilter
              bolim={bolim}
              type={isVersion ? "" : (type ?? "")}
              priority={priority ?? ""}
              assignee={assignee ?? ""}
              usta={usta ?? ""}
              resolveType={resolveType ?? ""}
              from={from ?? ""}
              to={to ?? ""}
              q={q ?? ""}
              types={selectableTypes}
              priorities={Object.entries(TICKET_PRIORITY)}
              xodimlar={xodimlar}
              ustalar={ustalarFull}
              canAssign={canAssign}
              hideType={isVersion}
            />
          </Card>

          {ticketsRaw.length === 0 && hasFilter ? (
            <EmptyState
              icon={isVersion ? DownloadCloud : Wrench}
              title={
                isVersion ? "Versiya so'rovi topilmadi" : "Muammo topilmadi"
              }
              hint="Filtrga mos yozuv yo'q."
            />
          ) : (
            <TicketTabs
              tabs={tabs}
              initialKey={canAssign ? "yangi" : "xodimga"}
            />
          )}
        </div>

        {/* Yangi muammo yaratish — faqat boshliq/admin (xodimga admin biriktiradi) */}
        {canAssign && (
          <div>
            <Card>
              <CardHeader>
                <CardTitle>
                  {isVersion ? "Yangi versiya so'rovi" : "Yangi muammo"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TicketForm
                  clients={clients}
                  defaultType={isVersion ? "VERSION_UPDATE" : undefined}
                  types={selectableTypes}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
