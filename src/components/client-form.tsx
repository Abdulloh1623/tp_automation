"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import type { ClientFormState } from "@/actions/clients";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  ClientPhonesField,
  type PhoneValue,
} from "@/components/client-phones-field";
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
  notes?: string | null;
  assignedToId?: string | null;
};

const initialState: ClientFormState = {};

export function ClientForm({
  action,
  operators,
  defaultValues = {},
  submitLabel = "Saqlash",
}: {
  action: (prev: ClientFormState, formData: FormData) => Promise<ClientFormState>;
  operators: Operator[];
  defaultValues?: ClientFormValues;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const v = defaultValues;
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
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
          <Input id="phone" name="phone" defaultValue={v.phone ?? ""} required aria-invalid={!!fe.phone} />
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
          <Label htmlFor="monthlyAmount">Oylik to'lov</Label>
          <Input
            id="monthlyAmount"
            name="monthlyAmount"
            type="number"
            min={0}
            step="0.01"
            defaultValue={v.monthlyAmount ?? 0}
            aria-invalid={!!fe.monthlyAmount}
          />
          <FieldError message={fe.monthlyAmount} />
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
          />
        </div>
      </div>

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
