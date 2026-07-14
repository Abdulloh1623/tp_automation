// Segment darajasidagi 404 — app-shell (nav) ichida, brendga mos.
// notFound() chaqirilganda (masalan mavjud bo'lmagan mijoz) ko'rsatiladi.
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <SearchX className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Sahifa topilmadi
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Siz izlagan sahifa mavjud emas yoki ko&apos;chirilgan.
        </p>
        <div className="mt-6">
          <Link href="/">
            <Button>Bosh sahifaga qaytish</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
