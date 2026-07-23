"use client";

// Mijoz nomiga bosilganda — profil sahifasiga o'tmasdan — orqa fon xiralashgan
// (blur) holda kichik "tez ko'rish" modali ochiladi. Barcha bo'limlarda bir xil
// bo'lishi uchun umumiy: ClientLink shu komponentga delegatsiya qiladi.
//
// Navigatsiya saqlanadi: Ctrl/Cmd/o'rta tugma yoki yangi tab — oddiy havola
// (profil sahifasi) bo'lib qolaveradi; oddiy chap-klik esa modalni ochadi.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { X, ArrowUpRight } from "lucide-react";
import { cn, formatMoney, formatDate, formatPhone, normalizePhone } from "@/lib/utils";
import { clientStatusLabel, equipmentModeLabel, ownershipLabel } from "@/lib/constants";
import { PhoneCopyButton } from "@/components/phone-copy";
import { getClientInfo, type ClientInfoData } from "@/actions/leads";

/** Mijoz ma'lumotlari (faqat o'qish) — tez ko'rish modalining tarkibi. */
export function ClientInfoView({
  info,
  onNavigate,
}: {
  info: ClientInfoData;
  /** "To'liq profil" bosilganda chaqiriladi — tez-ko'rish modalini yopish uchun
   *  (profil modali ustma-ust chiqmasin). */
  onNavigate?: () => void;
}) {
  const InfoItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 dark:text-slate-100">{value ?? "—"}</div>
    </div>
  );

  return (
    <div>
      <h3 className="mb-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">
        {info.restaurantName}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {info.fullName} · {clientStatusLabel(info.status)}
      </p>

      <div className="mt-3 max-h-[65vh] space-y-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <InfoItem
            label="Asosiy telefon"
            value={
              <span className="inline-flex items-center gap-1">
                <a
                  href={`tel:${normalizePhone(info.phone)}`}
                  className="text-primary-600 dark:text-primary-400"
                >
                  {formatPhone(info.phone)}
                </a>
                <PhoneCopyButton phone={info.phone} />
              </span>
            }
          />
          {info.phones.map((p, i) => (
            <InfoItem
              key={i}
              label={p.label}
              value={
                <span className="inline-flex items-center gap-1">
                  <a
                    href={`tel:${normalizePhone(p.number)}`}
                    className="text-primary-600 dark:text-primary-400"
                  >
                    {formatPhone(p.number)}
                  </a>
                  <PhoneCopyButton phone={p.number} />
                </span>
              }
            />
          ))}
          <InfoItem label="Viloyat" value={info.region} />
          <InfoItem label="Operator" value={info.operatorName} />
          <InfoItem label="Shartnoma raqami" value={info.contractNumber} />
          <InfoItem
            label="Shartnoma sanasi"
            value={info.contractDate ? formatDate(info.contractDate) : null}
          />
          <InfoItem label="Kim o'rnatgan" value={info.installerName} />
          <InfoItem label="Texnika" value={equipmentModeLabel(info.equipmentMode)} />
          <InfoItem label="Apparat" value={info.equipment} />
          <InfoItem label="Monoblok soni" value={String(info.monoblokCount)} />
          <InfoItem
            label="Oylik to'lov"
            value={formatMoney(info.monthlyAmount, info.currency)}
          />
          <InfoItem
            label="Keyingi to'lov"
            value={info.nextPaymentDate ? formatDate(info.nextPaymentDate) : null}
          />
          <InfoItem
            label="Oxirgi to'lov"
            value={
              info.lastPayment
                ? `${formatMoney(info.lastPayment.amount, info.lastPayment.currency)} · ${formatDate(info.lastPayment.paidAt)}`
                : null
            }
          />
        </div>

        {info.equipmentItems.length > 0 && (
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Uskunalar</div>
            <ul className="mt-1 space-y-0.5 text-sm text-slate-800 dark:text-slate-100">
              {info.equipmentItems.map((e, i) => (
                <li key={i}>
                  {e.name} × {e.quantity}{" "}
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    ({ownershipLabel(e.ownership)})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {info.notes && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">Izoh</div>
            <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">{info.notes}</p>
          </div>
        )}
      </div>

      <div className="mt-3">
        <Link
          href={`/mijozlar/${info.id}`}
          onClick={() => onNavigate?.()}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700"
        >
          To'liq profil <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

/** Orqa fon xiralashgan (blur) kichik modal — mijoz tez ko'rishi uchun. */
function QuickViewModal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  // Escape bilan yopish.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex justify-end">
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-500"
            aria-label="Yopish"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Mijoz nomi — bosilganda blur tez-ko'rish modalini ochadi. Ctrl/Cmd/o'rta
 * tugma yoki yangi tabда oddiy navigatsiya (profil) saqlanadi.
 */
export function ClientQuickView({
  id,
  name,
  className,
  children,
}: {
  id: string;
  name?: string;
  className?: string;
  /** Havola tarkibi (berilsa `name` o'rniga; default matn stillari qo'llanmaydi). */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<ClientInfoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Yangi tab / kombinatsiyali klik — oddiy havola bo'lib qolsin.
    if (
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      e.defaultPrevented
    ) {
      return;
    }
    e.preventDefault();
    setOpen(true);
    if (!info && !pending) {
      setError(null);
      startTransition(async () => {
        const res = await getClientInfo(id);
        if (res.ok) setInfo(res.info);
        else setError(res.error);
      });
    }
  }

  return (
    <>
      <Link
        href={`/mijozlar/${id}`}
        onClick={handleClick}
        className={
          children
            ? className
            : cn(
                "font-medium text-slate-900 hover:text-primary-600 hover:underline dark:text-slate-100 dark:hover:text-primary-400",
                className,
              )
        }
      >
        {children ?? name}
      </Link>
      {open && (
        <QuickViewModal onClose={() => setOpen(false)}>
          {info ? (
            <ClientInfoView info={info} onNavigate={() => setOpen(false)} />
          ) : error ? (
            <p className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
              Yuklanmoqda…
            </p>
          )}
        </QuickViewModal>
      )}
    </>
  );
}
