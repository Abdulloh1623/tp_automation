"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import type { ClientFormState } from "@/actions/clients";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  ClientPhonesField,
  type PhoneValue,
} from "@/components/client-phones-field";
import { ClientEquipmentPicker } from "@/components/client-equipment-picker";
import type { EqTypeOpt, UstaSource } from "@/components/client-equipment-panel";
import { FieldError } from "@/components/field-error";
import {
  CLIENT_STATUS,
  CURRENCY,
  REGIONS,
} from "@/lib/constants";
import { toDateInputValue } from "@/lib/utils";

type Operator = { id: string; name: string };

export type ClientFormValues = {
  fullName?: string;
  restaurantName?: string;
  region?: string | null;
  phone?: string;
  phones?: PhoneValue[];
  contractNumber?: string | null;
  contractDate?: Date | string | null;
  installerName?: string | null;
  monoblokCount?: number;
  equipment?: string | null;
  status?: string;
  monthlyAmount?: number;
  currency?: string;
  nextPaymentDate?: Date | string | null;
  debtAmount?: number;
  notes?: string | null;
  assignedToId?: string | null;
};

const initialState: ClientFormState = {};

export function ClientForm({
  action,
  operators,
  defaultValues = {},
  submitLabel = "Saqlash",
  showInitialPayment = false,
  equipmentTypes,
  ustaSources,
  closeOnSuccess = false,
}: {
  action: (prev: ClientFormState, formData: FormData) => Promise<ClientFormState>;
  operators: Operator[];
  defaultValues?: ClientFormValues;
  submitLabel?: string;
  /** Yangi mijoz uchun: oxirgi (boshlang'ich) to'lov maydonlarini ko'rsatadi. */
  showInitialPayment?: boolean;
  /** Berilsa (ADMIN/MANAGER + yangi mijoz) — uskuna tanlash bo'limi ko'rsatiladi. */
  equipmentTypes?: EqTypeOpt[];
  ustaSources?: UstaSource[];
  /**
   * Modal ichida tahrirlash uchun: server `redirect` qilmaydigan action (`{ ok:
   * true }` qaytaradi) ishlatilganda — muvaffaqiyatda modal klient tomonda yopiladi
   * (`router.back`) va ma'lumot yangilanadi (`router.refresh`).
   */
  closeOnSuccess?: boolean;
}) {
  const router = useRouter();
  const showEquipment = Array.isArray(equipmentTypes);
  const [state, formAction, pending] = useActionState(action, initialState);
  const v = defaultValues;
  const fe = state.fieldErrors ?? {};

  useEffect(() => {
    if (closeOnSuccess && state.ok) {
      router.refresh();
      router.back();
    }
  }, [closeOnSuccess, state.ok, router]);

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="fullName">FIO *</Label>
          <Input id="fullName" name="fullName" defaultValue={v.fullName ?? ""} required aria-invalid={!!fe.fullName} />
          <FieldError message={fe.fullName} />
        </div>
        <div>
          <Label htmlFor="restaurantName">Restoran nomi *</Label>
          <Input
            id="restaurantName"
            name="restaurantName"
            defaultValue={v.restaurantName ?? ""}
            required
            aria-invalid={!!fe.restaurantName}
          />
          <FieldError message={fe.restaurantName} />
        </div>
        <div>
          <Label htmlFor="phone">Asosiy telefon *</Label>
          <PhoneInput id="phone" name="phone" defaultValue={v.phone ?? ""} required aria-invalid={!!fe.phone} />
          <FieldError message={fe.phone} />
        </div>
        <div>
          <Label htmlFor="region">Viloyat</Label>
          <Select id="region" name="region" defaultValue={v.region ?? ""}>
            <option value="">— tanlang —</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="status">Holat</Label>
          <Select id="status" name="status" defaultValue={v.status ?? "ACTIVE"}>
            {Object.entries(CLIENT_STATUS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <ClientPhonesField defaultPhones={v.phones ?? []} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="contractNumber">Shartnoma raqami</Label>
          <Input
            id="contractNumber"
            name="contractNumber"
            defaultValue={v.contractNumber ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="contractDate">Shartnoma sanasi</Label>
          <Input
            id="contractDate"
            name="contractDate"
            type="date"
            defaultValue={toDateInputValue(v.contractDate)}
          />
        </div>
        <div>
          <Label htmlFor="installerName">Kim o'rnatgan</Label>
          <Input
            id="installerName"
            name="installerName"
            defaultValue={v.installerName ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="monoblokCount">Monoblok soni</Label>
          <Input
            id="monoblokCount"
            name="monoblokCount"
            type="number"
            min={0}
            defaultValue={v.monoblokCount ?? 1}
          />
        </div>
        <div>
          <Label htmlFor="equipment">Sotib olingan apparat</Label>
          <Input
            id="equipment"
            name="equipment"
            defaultValue={v.equipment ?? ""}
            placeholder="masalan: 1 monoblok + chek printer"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="monthlyAmount">
            {showEquipment ? "Oylik to'lov (ilova)" : "Oylik to'lov"}
          </Label>
          <MoneyInput
            id="monthlyAmount"
            name="monthlyAmount"
            defaultValue={v.monthlyAmount ?? 0}
            aria-invalid={!!fe.monthlyAmount}
          />
          <FieldError message={fe.monthlyAmount} />
          {showEquipment && (
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              Ijara uskuna summasi ustiga avtomatik qo'shiladi
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="currency">Valyuta</Label>
          <Select id="currency" name="currency" defaultValue={v.currency ?? "USD"}>
            {Object.entries(CURRENCY).map(([key, label]) => (
              <option key={key} value={key}>
                {key} ({label})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="nextPaymentDate">Keyingi to'lov sanasi</Label>
          <Input
            id="nextPaymentDate"
            name="nextPaymentDate"
            type="date"
            defaultValue={toDateInputValue(v.nextPaymentDate)}
            aria-invalid={!!fe.nextPaymentDate}
          />
          <FieldError message={fe.nextPaymentDate} />
        </div>
        <div>
          <Label htmlFor="debtAmount">Qarz qoldig'i</Label>
          <MoneyInput
            id="debtAmount"
            name="debtAmount"
            defaultValue={v.debtAmount ?? 0}
            aria-invalid={!!fe.debtAmount}
          />
          <FieldError message={fe.debtAmount} />
        </div>
      </div>

      {showEquipment && (
        <div className="space-y-2">
          <Label>Uskuna</Label>
          <ClientEquipmentPicker
            types={equipmentTypes ?? []}
            ustaSources={ustaSources ?? []}
            currency={v.currency ?? "USD"}
          />
        </div>
      )}

      {showInitialPayment && (
        <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Oxirgi to'lov (ixtiyoriy)
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Oldindan mavjud mijoz allaqachon to'lagan bo'lsa — summani va sanani kiriting.
            Bitta tarixiy to'lov yoziladi (chek shart emas). Bo'sh qoldirsangiz — yozilmaydi.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="lastPaymentAmount">To'lov summasi</Label>
              <MoneyInput id="lastPaymentAmount" name="lastPaymentAmount" defaultValue={0} />
            </div>
            <div>
              <Label htmlFor="lastPaymentDate">To'lov sanasi</Label>
              <Input id="lastPaymentDate" name="lastPaymentDate" type="date" />
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="assignedToId">Mas'ul operator</Label>
          <Select
            id="assignedToId"
            name="assignedToId"
            defaultValue={v.assignedToId ?? ""}
          >
            <option value="">— biriktirilmagan —</option>
            {operators.map((op) => (
              <option key={op.id} value={op.id}>
                {op.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Izoh</Label>
        <Textarea id="notes" name="notes" defaultValue={v.notes ?? ""} aria-invalid={!!fe.notes} />
        <FieldError message={fe.notes} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saqlanmoqda..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
