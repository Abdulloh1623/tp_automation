"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Clock, AlertCircle } from "lucide-react";
import {
  requestPasswordReset,
  cancelMyPasswordReset,
} from "@/actions/password-reset";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfilePasswordForm({
  hasPending,
  requestedAt,
}: {
  hasPending: boolean;
  requestedAt?: string;
}) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    if (newPassword.trim().length < 4) {
      setError("Parol kamida 4 belgi bo'lsin");
      return;
    }
    if (newPassword !== confirm) {
      setError("Parollar bir-biriga mos kelmadi");
      return;
    }
    start(async () => {
      const res = await requestPasswordReset({ newPassword, confirm, note });
      if (res.ok) {
        setNewPassword("");
        setConfirm("");
        setNote("");
        toast("So'rov yuborildi — admin tasdig'ini kuting", "success");
        router.refresh();
      } else {
        setError(res.error ?? "Xatolik");
      }
    });
  }

  function cancel() {
    start(async () => {
      const res = await cancelMyPasswordReset();
      if (res.ok) {
        toast("So'rov bekor qilindi", "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  if (hasPending) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Parolni tiklash so'rovingiz yuborilgan{requestedAt ? ` (${requestedAt})` : ""}.
            Admin tasdiqlagach yangi parol kuchga kiradi.
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={cancel} disabled={pending}>
          {pending ? "..." : "So'rovni bekor qilish"}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-sm space-y-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Yangi parol kiriting va so'rov yuboring. Admin tasdiqlagach parol almashadi.
      </p>
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <div>
        <Label htmlFor="newPassword">Yangi parol</Label>
        <Input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="kamida 4 belgi"
          autoComplete="new-password"
        />
      </div>
      <div>
        <Label htmlFor="confirm">Yangi parolni takrorlang</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div>
        <Label htmlFor="note">Izoh (ixtiyoriy)</Label>
        <Input
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="masalan: parolni unutdim"
        />
      </div>
      <Button onClick={submit} disabled={pending}>
        <KeyRound className="h-4 w-4" />
        {pending ? "Yuborilmoqda..." : "So'rov yuborish"}
      </Button>
    </div>
  );
}
