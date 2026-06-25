"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertCircle, Plus } from "lucide-react";
import { createTicket, type TicketFormState } from "@/actions/tickets";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TICKET_PRIORITY, TICKET_TYPE } from "@/lib/constants";

type ClientOption = { id: string; restaurantName: string; fullName: string };

const initialState: TicketFormState = {};

export function TicketForm({
  clientId,
  clients,
}: {
  clientId?: string;
  clients?: ClientOption[];
}) {
  const [state, formAction, pending] = useActionState(
    createTicket,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.error) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {state.error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      {clientId ? (
        <input type="hidden" name="clientId" value={clientId} />
      ) : (
        <div>
          <Label htmlFor="clientId">Mijoz</Label>
          <Select id="clientId" name="clientId" defaultValue="" required>
            <option value="" disabled>
              — mijozni tanlang —
            </option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.restaurantName} ({c.fullName})
              </option>
            ))}
          </Select>
        </div>
      )}

      <div>
        <Label htmlFor="title">Muammo</Label>
        <Input
          id="title"
          name="title"
          placeholder="masalan: soliq cheki chiqmayapti"
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="type">Turi</Label>
          <Select id="type" name="type" defaultValue="TECHNICAL">
            {Object.entries(TICKET_TYPE).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="priority">Ustuvorlik</Label>
          <Select id="priority" name="priority" defaultValue="MEDIUM">
            {Object.entries(TICKET_PRIORITY).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Button type="submit" size="sm" disabled={pending}>
        <Plus className="h-4 w-4" />
        {pending ? "Saqlanmoqda..." : "Muammo qo'shish"}
      </Button>
    </form>
  );
}
