"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 aria-[invalid=true]:border-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800 dark:aria-[invalid=true]:border-red-500";

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v3M16 3v3" />
    </svg>
  );
}

/**
 * Sana maydoni: o'ng chetida kalendar tugmasi. Bosilganda brauzerning o'z
 * kalendari ochiladi (bo'sh bo'lsa — joriy oy/yildan boshlab).
 */
const DateInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, disabled, ...props }, ref) => {
  const innerRef = React.useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = innerRef.current;
    if (!el || disabled) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  return (
    <div className="relative">
      <input
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        disabled={disabled}
        className={cn(
          inputClass,
          "pr-10 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={openPicker}
        aria-label="Kalendarni ochish"
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition-colors hover:text-primary-600 disabled:cursor-not-allowed disabled:hover:text-slate-400 dark:text-slate-500 dark:hover:text-primary-400"
      >
        <CalendarIcon className="h-4 w-4" />
      </button>
    </div>
  );
});
DateInput.displayName = "DateInput";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  if (props.type === "date") {
    return <DateInput ref={ref} className={className} {...props} />;
  }
  return (
    <input ref={ref} className={cn(inputClass, className)} {...props} />
  );
});
Input.displayName = "Input";
