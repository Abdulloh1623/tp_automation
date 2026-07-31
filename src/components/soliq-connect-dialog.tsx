"use client";

// "Soliqqa ulash" arizasi — tugma + modal forma. Mijoz profilida ham, mijozlar
// ro'yxatida ham ishlatiladi. Yuborilgach admin/menejerga boradi.
//
// Oyna umumiy `Modal` qobig'ida — portal va balandlik qoidalari o'sha yerda.

import { useCallback, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Landmark } from "lucide-react";
import { submitTaxConnection } from "@/actions/soliq";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
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

  const close = useCallback(() => {
    if (!pending) setOpen(false);
  }, [pending]);

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
    <Modal
      open={open}
      onClose={close}
      onSubmit={onSubmit}
      title="Soliqqa ulash"
      subtitle={clientName}
      icon={<Landmark className="h-4 w-4" />}
      note="Ariza boshliqqa boradi — hujjatlar tekshirilgach «Ulandi» deb belgilanadi."
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={close} disabled={pending}>
            Bekor
          </Button>
          <Button type="submit" size="sm" loading={pending}>
            Yuborish
          </Button>
        </>
      }
    >
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

      <FileField id={`cert-doc-${clientId}`} name="certificateDoc" label="Guvohnoma skani" />

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

      <FileField id={`doc-${clientId}`} name="document" label="Kadastr yoki ijara shartnomasi" />

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
    </Modal>
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

      {dialog}
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
