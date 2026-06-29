import * as React from "react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 aria-[invalid=true]:border-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:aria-[invalid=true]:border-red-500",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
Select.displayName = "Select";
