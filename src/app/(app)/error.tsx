"use client";

// Segment darajasidagi xato chegarasi — app-shell (nav) ichida ko'rsatiladi,
// shuning uchun foydalanuvchi kontekstni yo'qotmaydi. Xato allaqachon
// instrumentation orqali Telegram'ga yuborilgan; bu faqat UI.
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Kutilmagan xatolik yuz berdi
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Iltimos, qayta urinib ko&apos;ring. Muammo davom etsa, administrator bilan
          bog&apos;laning — xato avtomatik qayd etildi.
        </p>
        {error?.digest && (
          <code className="mt-3 inline-block rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Xato kodi: {error.digest}
          </code>
        )}
        <div className="mt-6">
          <Button onClick={() => reset()}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Qayta urinish
          </Button>
        </div>
      </div>
    </div>
  );
}
