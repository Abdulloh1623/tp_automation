"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Landmark, X } from "lucide-react";
import { submitTaxConnection } from "@/actions/soliq";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const FILE_ACCEPT =
  ".pdf,.jpg,.jpeg,.doc,.docx,application/pdf,image/jpeg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * "Soliqqa ulash" tugmasi + modal forma. Mijoz profilida ham, mijozlar
 * ro'yxatida ham ishlatiladi. Yuborilgach admin/menejerga boradi.
 */
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

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Soliqqa ulash
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{clientName}</p>
              </div>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Yopish"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <Field label="Firma guvohnomasi raqami">
                <Input name="certificateNo" required maxLength={120} placeholder="Guvohnoma raqami" />
              </Field>
              <Field label="Guvohnoma skani (pdf / jpeg / word)">
                <input
                  type="file"
                  name="certificateDoc"
                  accept={FILE_ACCEPT}
                  required
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:hover:file:bg-slate-700"
                />
              </Field>
              <Field label="Firma rahbarining ismi va familiyasi">
                <Input name="directorName" required maxLength={200} placeholder="Ism Familiya" />
              </Field>
              <Field label="Firma rahbari telefon raqami">
                <Input name="directorPhone" type="tel" required maxLength={40} placeholder="+998 ..." />
              </Field>
              <Field label="Firma kadastri yoki ijara shartnomasi (pdf / jpeg / word)">
                <input
                  type="file"
                  name="document"
                  accept={FILE_ACCEPT}
                  required
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:hover:file:bg-slate-700"
                />
              </Field>
              <Field label="Firma geolokatsiyasi linki">
                <Input name="geoLink" type="url" required maxLength={1000} placeholder="https://maps..." />
              </Field>
              <Field label="Izoh (ixtiyoriy)">
                <Textarea name="note" rows={2} maxLength={500} placeholder="Qo'shimcha izoh…" />
              </Field>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                  Bekor qilish
                </Button>
                <Button type="submit" loading={pending}>
                  <Landmark className="h-4 w-4" /> Yuborish
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </label>
      {children}
    </div>
  );
}
