import { Badge } from "@/components/ui/badge";
import {
  callResultLabel,
  clientAppVersionLabel,
  clientStatusLabel,
  isClientAppVersion,
  leadOutcomeLabel,
  leadStageLabel,
  TICKET_PRIORITY,
  TICKET_STATUS,
  TICKET_TYPE,
  type CallResult,
  type ClientAppVersion,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "blue" | "green" | "amber" | "red" | "slate";
import {
  PAYMENT_STATE_LABEL,
  paymentState,
  type PaymentState,
} from "@/lib/payment-status";

export function ClientStatusBadge({ status }: { status: string }) {
  const tone =
    status === "ACTIVE" ? "green" : status === "PENDING" ? "amber" : "slate";
  return <Badge tone={tone}>{clientStatusLabel(status)}</Badge>;
}

// Dastur versiyasi bo'yicha rang — eskidan yangiga qadar bosqichma-bosqich
// (sovuqdan ilikka), "kiritilmagan" (v?) esa har doim qizil (e'tibor talab
// qiladi) — Badge komponentining 6 tonasidan tashqari, o'ziga xos palitra.
const APP_VERSION_TONE: Record<ClientAppVersion, string> = {
  V0: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  V1: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  V2: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  V3: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  V4: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};
const APP_VERSION_UNKNOWN_TONE =
  "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";

export function ClientAppVersionBadge({
  version,
  className,
}: {
  version?: string | null;
  className?: string;
}) {
  const tone =
    version && isClientAppVersion(version)
      ? APP_VERSION_TONE[version]
      : APP_VERSION_UNKNOWN_TONE;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        tone,
        className,
      )}
    >
      {clientAppVersionLabel(version)}
    </span>
  );
}

const paymentTone: Record<PaymentState, "red" | "amber" | "blue" | "green" | "neutral"> =
  {
    OVERDUE: "red",
    DUE_TODAY: "amber",
    DUE_SOON: "blue",
    OK: "green",
    NONE: "neutral",
  };

export function PaymentStatusBadge({
  nextPaymentDate,
}: {
  nextPaymentDate: Date | string | null | undefined;
}) {
  const state = paymentState(nextPaymentDate);
  return <Badge tone={paymentTone[state]}>{PAYMENT_STATE_LABEL[state]}</Badge>;
}

const callTone: Record<string, "green" | "red" | "amber" | "blue" | "neutral" | "slate"> = {
  TALKED: "green",
  RESOLVED: "green",
  NO_ANSWER: "red",
  PHONE_OFF: "red",
  BUSY: "amber",
  SMS_SENT: "blue",
  TELEGRAM_SENT: "blue",
  ESCALATED: "red",
  ESCALATION_STAFF_ASSIGNED: "blue",
  TICKET_IN_PROGRESS: "blue",
  TICKET_REOPENED: "amber",
  TICKET_DISMISSED: "slate",
  TICKET_STAFF_ASSIGNED: "blue",
  UNASSIGNED: "slate",
  RETURN_REQUESTED: "red",
  RETURN_ASSIGNED: "blue",
  RETURN_IN_PROGRESS: "amber",
  RETURN_REJECTED: "slate",
  RETURN_DONE: "green",
  RETURN_REVERTED: "slate",
};

export function CallResultBadge({ result }: { result: string }) {
  return (
    <Badge tone={callTone[result] ?? "neutral"}>
      {callResultLabel(result as CallResult)}
    </Badge>
  );
}

const ticketStatusTone: Record<string, "amber" | "blue" | "green"> = {
  OPEN: "amber",
  IN_PROGRESS: "blue",
  RESOLVED: "green",
};

export function TicketStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={ticketStatusTone[status] ?? "neutral"}>
      {TICKET_STATUS[status as TicketStatus] ?? status}
    </Badge>
  );
}

const ticketPriorityTone: Record<string, "slate" | "amber" | "red"> = {
  LOW: "slate",
  MEDIUM: "amber",
  HIGH: "red",
};

export function TicketPriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge tone={ticketPriorityTone[priority] ?? "neutral"}>
      {TICKET_PRIORITY[priority as TicketPriority] ?? priority}
    </Badge>
  );
}

export function TicketTypeBadge({ type }: { type: string }) {
  return (
    <Badge tone="neutral">{TICKET_TYPE[type as TicketType] ?? type}</Badge>
  );
}

const leadStageTone: Record<string, BadgeTone> = {
  NEW: "blue",
  NO_ANSWER: "red",
  LATER: "amber",
  AWAITING_PAYMENT: "amber",
  FOLLOW_UP: "green",
  ISSUE_OPEN: "amber",
  ESCALATED: "red",
  FORWARDED: "slate",
  RETURNING: "amber",
  RESOLVED: "green",
  REFUSED: "red",
  DEACTIVATED: "slate",
};

export function LeadStageBadge({ stage }: { stage: string }) {
  return (
    <Badge tone={leadStageTone[stage] ?? "neutral"}>{leadStageLabel(stage)}</Badge>
  );
}

const leadOutcomeTone: Record<string, BadgeTone> = {
  NO_ANSWER: "red",
  PHONE_OFF: "red",
  BUSY: "amber",
  CALL_LATER: "amber",
  WILL_PAY: "blue",
  PAYMENT_REMINDED: "blue",
  FORWARDED: "slate",
  HAS_ISSUE: "amber",
  NEEDS_UPDATE: "blue",
  NO_PROBLEM: "green",
  SUGGESTION: "blue",
  PAID: "green",
  RESOLVED: "green",
  DEACTIVATED: "slate",
};

export function LeadOutcomeBadge({ outcome }: { outcome: string }) {
  return (
    <Badge tone={leadOutcomeTone[outcome] ?? "neutral"}>
      {leadOutcomeLabel(outcome)}
    </Badge>
  );
}
