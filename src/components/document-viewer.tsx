"use client";

// Hujjat/chek ko'ruvchi — mijoz profilidagi "To'lov cheki", "Soliqqa ulash"
// fayllari va uskuna topshirish hujjatlari SHU modalda ochiladi.
//
// NEGA: ilgari bunday fayllar xom URL bilan yangi tabda ochilardi (brauzerning
// bo'sh oynasi, hech qanday kontekstsiz) — qaysi mijoz, qancha summa, qaysi
// sana ekani ko'rinmasdi va orqaga qaytish uchun tab yopish kerak edi. Endi
// fayl kontekst bilan birga, profil bilan bir xil uslubda ochiladi.
//
// Imperativ API (ConfirmDialog/Toaster kabi): istalgan joydan
// `openDocument({...})` chaqiriladi, host esa app-shell'da bir marta turadi.

import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type DocumentMeta = { label: string; value: string };

export type DocumentOptions = {
  /** Faylning himoyalangan URL'i (masalan /api/receipts/<id>) */
  url: string;
  /** Modal sarlavhasi — "To'lov cheki", "Guvohnoma" ... */
  title: string;
  /** Sarlavha ostidagi qator — odatda mijoz nomi */
  subtitle?: string;
  /** Yorliq–qiymat juftliklari (summa, sana, usul, qabul qildi ...) */
  meta?: DocumentMeta[];
  /** PDF bo'lsa iframe'da, aks holda rasm sifatida ko'rsatiladi */
  isPdf?: boolean;
  /** Yuklab olishda taklif qilinadigan fayl nomi */
  downloadName?: string;
  /** Qo'shimcha izoh (chek izohi kabi) */
  note?: string | null;
};

const EVENT = "app-document";

/** Istalgan joydan hujjatni ochish: openDocument({ url, title, ... }). */
export function openDocument(opts: DocumentOptions): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: opts }));
}

/** Bir marta (app-shell'da) joylashtiriladigan host. */
export function DocumentViewer() {
  const [doc, setDoc] = useState<DocumentOptions | null>(null);
  // Rasm ochilmasa (buzuq fayl yoki kutilmagan tur) — havolaga qaytamiz
  const [imgFailed, setImgFailed] = useState(false);
  // Chaqiruvchi turini bilmasa (isPdf berilmagan) — HEAD so'rovi bilan aniqlaymiz
  const [detectedPdf, setDetectedPdf] = useState<boolean | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      setImgFailed(false);
      setDetectedPdf(null);
      setDoc((e as CustomEvent).detail as DocumentOptions);
    }
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  // Fayl turi noma'lum bo'lsa — Content-Type'ni HEAD bilan so'raymiz. Shu sabab
  // chaqiruvchi kengaytmani bilmasa ham (masalan /api/handouts/<id>) PDF to'g'ri
  // ko'rsatiladi.
  useEffect(() => {
    if (!doc || doc.isPdf !== undefined) return;
    let cancelled = false;
    fetch(doc.url, { method: "HEAD" })
      .then((r) => {
        if (!cancelled) setDetectedPdf((r.headers.get("content-type") ?? "").includes("pdf"));
      })
      .catch(() => {
        if (!cancelled) setDetectedPdf(false); // aniqlab bo'lmadi — rasm sifatida urinamiz
      });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const close = useCallback(() => setDoc(null), []);

  useEffect(() => {
    if (!doc) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    // Modal ochiq turganda orqa sahifa scroll qilmasin (profil modali kabi)
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [doc, close]);

  if (!doc) return null;

  // null — hali aniqlanmagan (HEAD so'rovi ketmoqda)
  const isPdf: boolean | null = doc.isPdf ?? detectedPdf;

  return (
    <div
      className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/50 p-2 backdrop-blur-md sm:p-6"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={doc.title}
    >
      <div
        className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-950 dark:ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hi-Tech aksent chizig'i — profil modali bilan bir xil til */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-500/70 to-transparent" />

        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                {doc.title}
              </h2>
              {doc.subtitle && (
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                  {doc.subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Yopish"
            className="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {doc.meta && doc.meta.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-900/40">
            {doc.meta.map((m) => (
              <div key={m.label} className="min-w-0">
                <dt className="text-xs text-slate-500 dark:text-slate-400">{m.label}</dt>
                <dd className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {doc.note && (
          <p className="border-b border-slate-100 px-5 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
            📝 {doc.note}
          </p>
        )}

        <div className="flex max-h-[65vh] min-h-[220px] items-center justify-center overflow-auto bg-slate-100 p-3 dark:bg-slate-900">
          {isPdf === null ? (
            <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda…</div>
          ) : isPdf ? (
            <iframe
              src={doc.url}
              title={doc.title}
              className="h-[65vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800"
            />
          ) : imgFailed ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Faylni shu yerda ko&apos;rsatib bo&apos;lmadi.
              <br />
              Pastdagi &laquo;Yangi tabda ochish&raquo; tugmasidan foydalaning.
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.url}
              alt={doc.title}
              onError={() => setImgFailed(true)}
              className="max-h-[62vh] w-auto rounded-lg object-contain shadow-sm"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3">
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50",
              "dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
            )}
          >
            <ExternalLink className="h-4 w-4" /> Yangi tabda ochish
          </a>
          <a
            href={doc.url}
            download={doc.downloadName ?? true}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            <Download className="h-4 w-4" /> Yuklab olish
          </a>
        </div>
      </div>
    </div>
  );
}
