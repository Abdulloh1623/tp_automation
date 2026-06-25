// Sahifalar yuklanayotganda ko'rsatiladigan umumiy skeleton (Next.js Suspense fallback).
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      {/* Sarlavha */}
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-lg bg-slate-200" />
        <div className="h-4 w-40 rounded bg-slate-100" />
      </div>

      {/* Filtr/asboblar paneli */}
      <div className="h-16 rounded-xl border border-slate-200 bg-white" />

      {/* Jadval/ro'yxat skeleton */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="h-10 border-b border-slate-200 bg-slate-50" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0">
            <div className="h-4 flex-1 rounded bg-slate-100" />
            <div className="h-4 w-24 rounded bg-slate-100" />
            <div className="h-4 w-28 rounded bg-slate-100" />
            <div className="h-4 w-16 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
