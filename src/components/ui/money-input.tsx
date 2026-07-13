"use client";

import * as React from "react";
import { Input } from "./input";
import { formatAmountInput, parseAmountInput } from "@/lib/utils";

type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "type"
> & {
  /** Native form uchun — yashirin input shu nom bilan XOM qiymatni yuboradi. */
  name?: string;
  /** Controlled: xom raqamli qiymat ("9000000"). */
  value?: string;
  /** Uncontrolled boshlang'ich qiymat. */
  defaultValue?: string | number;
  /** Controlled: har o'zgarishда xom qiymatni qaytaradi. */
  onValueChange?: (raw: string) => void;
};

/**
 * Summa input'i: yozilayotganda mingliklar probel bilan ajratiladi
 * ("9 000 000"), lekin formaga/action'ga XOM raqam ("9000000") boradi.
 * - Controlled: `value` (xom) + `onValueChange`.
 * - Uncontrolled: `name` + `defaultValue` (yashirin input xom qiymatni yuboradi).
 */
export function MoneyInput({
  name,
  value,
  defaultValue,
  onValueChange,
  ...rest
}: MoneyInputProps) {
  const controlled = value !== undefined;
  const [raw, setRaw] = React.useState(() =>
    parseAmountInput(String(defaultValue ?? "")),
  );
  const current = controlled ? parseAmountInput(String(value)) : raw;

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const next = parseAmountInput(e.target.value);
    if (!controlled) setRaw(next);
    onValueChange?.(next);
  }

  return (
    <>
      <Input
        {...rest}
        type="text"
        inputMode="decimal"
        value={formatAmountInput(current)}
        onChange={handle}
      />
      {name ? <input type="hidden" name={name} value={current} /> : null}
    </>
  );
}
