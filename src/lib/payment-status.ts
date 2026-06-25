import { daysUntil } from "./utils";

export type PaymentState =
  | "OVERDUE"
  | "DUE_TODAY"
  | "DUE_SOON"
  | "OK"
  | "NONE";

/** To'lov holatini nextPaymentDate bo'yicha aniqlaydi. */
export function paymentState(
  nextPaymentDate: Date | string | null | undefined,
): PaymentState {
  const d = daysUntil(nextPaymentDate);
  if (d === null) return "NONE";
  if (d < 0) return "OVERDUE";
  if (d === 0) return "DUE_TODAY";
  if (d <= 5) return "DUE_SOON";
  return "OK";
}

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  OVERDUE: "Muddati o'tgan",
  DUE_TODAY: "Bugun to'lov",
  DUE_SOON: "To'lov yaqin",
  OK: "Joyida",
  NONE: "Belgilanmagan",
};

/** Dashboard tartiblash uchun shoshilinchlik darajasi (kichik = shoshilinch). */
export function paymentUrgency(state: PaymentState): number {
  switch (state) {
    case "OVERDUE":
      return 0;
    case "DUE_TODAY":
      return 1;
    case "DUE_SOON":
      return 2;
    case "OK":
      return 3;
    case "NONE":
      return 4;
  }
}
