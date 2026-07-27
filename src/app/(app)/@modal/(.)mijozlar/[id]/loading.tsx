// Mijoz profili modali yuklanayotgandagi skelet.
//
// NEGA: ilgari bu marshrutda `loading.tsx` yo'q edi — mijoz nomi bosilganda
// server profilni to'liq tayyorlab bo'lguncha ekranda HECH NARSA o'zgarmasdi
// va ilova "javob bermayotgandek" ko'rinardi. Endi modal darhol ochiladi,
// ma'lumot esa kelgach o'z joyiga tushadi.
export default function ProfileModalLoading() {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-2 backdrop-blur-md sm:p-6">
      <div className="mx-auto w-full max-w-5xl animate-pulse overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="p-3 sm:p-5">
          {/* Hero: avatar + nom + badge'lar */}
          <div className="rounded-2xl bg-slate-800 p-5 dark:bg-slate-900">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-slate-700" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-56 rounded bg-slate-700" />
                <div className="h-4 w-40 rounded bg-slate-700/70" />
                <div className="flex gap-2 pt-1">
                  <div className="h-5 w-20 rounded-full bg-slate-700/70" />
                  <div className="h-5 w-24 rounded-full bg-slate-700/70" />
                </div>
              </div>
            </div>
            {/* KPI plitkalari */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-slate-700/60" />
              ))}
            </div>
          </div>

          {/* Ikki ustunli bo'limlar */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="mb-3 h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800/70" />
                  <div className="h-3 w-4/5 rounded bg-slate-100 dark:bg-slate-800/70" />
                  <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800/70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
