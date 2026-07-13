"use client";

import * as React from "react";
import { Input } from "./input";
import { formatPhoneInput } from "@/lib/utils";

type PhoneInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "type"
> & {
  name?: string;
  /** Controlled qiymat. */
  value?: string;
  /** Uncontrolled boshlang'ich qiymat. */
  defaultValue?: string;
  onValueChange?: (v: string) => void;
};

/**
 * Telefon input'i: jonli "+998 90 481 43 75" formati. Bo'sh maydonga fokus
 * bo'lganda default "+998 " qo'yiladi (uni o'chirish/o'zgartirish mumkin —
 * majburlanmaydi). Undan keyin kompaniya kodi + mobil raqam yoziladi.
 * - Controlled: `value` + `onValueChange`.
 * - Uncontrolled: `name` + `defaultValue` (native form FormData'siga tushadi).
 */
export function PhoneInput({
  name,
  value,
  defaultValue,
  onValueChange,
  onFocus,
  placeholder,
  ...rest
}: PhoneInputProps) {
  const controlled = value !== undefined;
  const [inner, setInner] = React.useState(() =>
    defaultValue ? formatPhoneInput(defaultValue) : "",
  );
  const current = controlled ? formatPhoneInput(value ?? "") : inner;

  function update(next: string) {
    const f = formatPhoneInput(next);
    if (!controlled) setInner(f);
    onValueChange?.(f);
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    if (!current) {
      if (!controlled) setInner("+998 ");
      onValueChange?.("+998 ");
    }
    onFocus?.(e);
  }

  return (
    <Input
      {...rest}
      // Uncontrolled rejimda native form qiymatni ko'rinadigan input'dan oladi.
      name={controlled ? undefined : name}
      type="tel"
      inputMode="tel"
      placeholder={placeholder ?? "+998 90 123 45 67"}
      value={controlled ? current : inner}
      onChange={(e) => update(e.target.value)}
      onFocus={handleFocus}
    />
  );
}
