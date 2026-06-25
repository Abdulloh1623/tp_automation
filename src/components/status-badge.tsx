import { Badge } from "@/components/ui/badge";
import {
  callResultLabel,
  clientStatusLabel,
  leadOutcomeLabel,
  leadStageLabel,
  TICKET_PRIORITY,
  TICKET_STATUS,
  TICKET_TYPE,
  type CallResult,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
} from "@/lib/constants";

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

const callTone: Record<string, "green" | "red" | "amber" | "blue" | "neutral"> = {
  TALKED: "green",
  RESOLVED: "green",
  NO_ANSWER: "red",
  PHONE_OFF: "red",
  BUSY: "amber",
  SMS_SENT: "blue",
  TELEGRAM_SENT: "blue",
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
  ESCALATED: "red",
  FORWARDED: "slate",
  RESOLVED: "green",
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
  NO_PROBLEM: "green",
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
