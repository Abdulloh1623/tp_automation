"use client";

// "Soliqqa ulash" arizasi — tugma + modal forma. Mijoz profilida ham, mijozlar
// ro'yxatida ham ishlatiladi. Yuborilgach admin/menejerga boradi.
//
// Ko'rinish to'lovni tahrirlash oynasi bilan bir xil qolipda:
//  - oyna PORTAL orqali `document.body`ga chiqariladi. Profil modali
//    `backdrop-blur` ishlatadi, backdrop-filter esa ichidagi `position: fixed`
//    elementlar uchun yangi containing block yaratadi — busiz oyna viewport'ga
//    emas, uzun profil scroll-konteyneriga nisbatan joylashib, bahaybat va
//    tushunarsiz ochilardi;
//  - karta balandligi ekranga sig'adi: sarlavha va "Yuborish" paneli joyida
//    qoladi, o'rtadagi uzun forma (7 maydon) o'zi scroll bo'ladi.

import { useCallback, useEffect, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Landmark, X } from "lucide-react";
import { submitTaxConnection } from "@/actions/soliq";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SOLIQ_DOC_MAX_MB } from "@/lib/constants";

const FILE_ACCEPT =
  ".pdf,.jpg,.jpeg,.doc,.docx,application/pdf,image/jpeg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MAX_BYTES = SOLIQ_DOC_MAX_MB * 1024 * 1024;

export function SoliqConnectDialog({
  clientId,
  clientName,
  compact = false,
}: {
  clientId: string;
  clientName: string;
  /** Ro'yxatda ixcham ikonka-tugma ko'rinishi. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    if (!pending) setOpen(false);
  }, [pending]);

  // Escape bilan yopish + orqa fon scroll qilmasin (boshqa modallar kabi)
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation(); // profil modali ham yopilib ketmasin
        close();
      }
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const res = await submitTaxConnection(clientId, fd);
      if (res.ok) {
        toast("Soliqqa ulash arizasi yuborildi", "success");
        setOpen(false);
        form.reset();
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Soliqqa ulash"
    >
      <form
        onSubmit={onSubmit}
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-200/80 bg-white shadow-2xl ring-1 ring-black/5 sm:max-h-[85dvh] sm:rounded-2xl dark:border-slate-800 dark:bg-slate-950 dark:ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400">
              <Landmark className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                Soliqqa ulash
              </h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{clientName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Yopish"
            className="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="shrink-0 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          Ariza boshliqqa boradi — hujjatlar tekshirilgach &laquo;Ulandi&raquo; deb belgilanadi.
        </p>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div>
            <Label htmlFor={`cert-no-${clientId}`}>Firma guvohnomasi raqami</Label>
            <Input
              id={`cert-no-${clientId}`}
              name="certificateNo"
              required
              maxLength={120}
              placeholder="Guvohnoma raqami"
            />
          </div>

          <FileField
            id={`cert-doc-${clientId}`}
            name="certificateDoc"
            label="Guvohnoma skani"
          />

          <div>
            <Label htmlFor={`director-${clientId}`}>Firma rahbarining ismi va familiyasi</Label>
            <Input
              id={`director-${clientId}`}
              name="directorName"
              required
              maxLength={200}
              placeholder="Ism Familiya"
            />
          </div>

          <div>
            <Label htmlFor={`director-phone-${clientId}`}>Firma rahbari telefon raqami</Label>
            <Input
              id={`director-phone-${clientId}`}
              name="directorPhone"
              type="tel"
              required
              maxLength={40}
              placeholder="+998 ..."
            />
          </div>

          <FileField
            id={`doc-${clientId}`}
            name="document"
            label="Kadastr yoki ijara shartnomasi"
          />

          <div>
            <Label htmlFor={`geo-${clientId}`}>Firma geolokatsiyasi linki</Label>
            <Input
              id={`geo-${clientId}`}
              name="geoLink"
              type="url"
              required
              maxLength={1000}
              placeholder="https://maps..."
            />
          </div>

          <div>
            <Label htmlFor={`note-${clientId}`}>Izoh</Label>
            <Textarea
              id={`note-${clientId}`}
              name="note"
              rows={2}
              maxLength={500}
              className="min-h-[64px]"
              placeholder="Ixtiyoriy"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
          <Button type="button" variant="ghost" size="sm" onClick={close} disabled={pending}>
            Bekor
          </Button>
          <Button type="submit" size="sm" loading={pending}>
            Yuborish
          </Button>
        </div>
      </form>
    </div>
  );

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Soliqqa ulash"
          aria-label="Soliqqa ulash"
          className="rounded-md p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
        >
          <Landmark className="h-4 w-4" />
        </button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Landmark className="h-4 w-4" /> Soliqqa ulash
        </Button>
      )}

      {open && mounted && createPortal(dialog, document.body)}
    </>
  );
}

/**
 * Fayl maydoni — hajmi SHU YERDA tekshiriladi. Busiz katta hujjat bilan
 * "Yuborish" bosilsa so'rov server action'ning body chegarasiga urilib,
 * foydalanuvchi hech qanday tushunarli xabar ko'rmasdi.
 */
function FileField({ id, name, label }: { id: string; name: string; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        type="file"
        name={name}
        accept={FILE_ACCEPT}
        required
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && f.size > MAX_BYTES) {
            setError(
              `Fayl juda katta (${Math.round(f.size / 1024 / 1024)}MB) — chegara ${SOLIQ_DOC_MAX_MB}MB`,
            );
            setPicked(null);
            e.target.value = ""; // tanlov bekor qilinadi, forma yuborilmaydi
            return;
          }
          setError(null);
          setPicked(f?.name ?? null);
        }}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:hover:file:bg-slate-700"
      />
      {error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <p className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">
          {picked ?? `PDF, JPEG yoki Word · ${SOLIQ_DOC_MAX_MB}MB gacha`}
        </p>
      )}
    </div>
  );
}
