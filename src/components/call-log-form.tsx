"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertCircle, PhoneCall } from "lucide-react";
import { addCallLog, type CallLogFormState } from "@/actions/calllogs";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/field-error";
import { CALL_RESULT } from "@/lib/constants";

const initialState: CallLogFormState = {};

export function CallLogForm({ clientId }: { clientId: string }) {
  const action = addCallLog.bind(null, clientId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const fe = state.fieldErrors ?? {};

  useEffect(() => {
    if (!state.error) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {state.error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="result">Natija</Label>
          <Select id="result" name="result" defaultValue="TALKED">
            {Object.entries(CALL_RESULT).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="nextFollowUpDate">Keyingi qo'ng'iroq sanasi</Label>
          <Input id="nextFollowUpDate" name="nextFollowUpDate" type="date" />
        </div>
      </div>
      <div>
        <Label htmlFor="note">Izoh</Label>
        <Textarea
          id="note"
          name="note"
          placeholder="Suhbat natijasi, kelishuv..."
          className="min-h-[60px]"
          aria-invalid={!!fe.note}
        />
        <FieldError message={fe.note} />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        <PhoneCall className="h-4 w-4" />
        {pending ? "Saqlanmoqda..." : "Qo'ng'iroqni yozish"}
      </Button>
    </form>
  );
}
