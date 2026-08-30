"use client";

import { useState, useTransition } from "react";
import {
  User as UserIcon,
  Shield,
  MapPin,
  KeyRound,
  AlertCircle,
} from "lucide-react";
import { updateMyPhone, changeMyPassword } from "@/actions/usta";
import { toast } from "@/components/toaster";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UstaProfileForm({
  name,
  username,
  region,
  phone,
}: {
  name: string;
  username: string;
  region: string | null;
  phone: string | null;
}) {
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [phonePending, startPhone] = useTransition();

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwPending, startPw] = useTransition();

  function savePhone() {
    startPhone(async () => {
      const res = await updateMyPhone(phoneValue);
      if (res.ok) {
        toast("Telefon raqami yangilandi", "success");
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  function savePassword() {
    setPwError(null);
    if (newPassword.trim().length < MIN_PASSWORD_LENGTH) {
      setPwError(`Parol kamida ${MIN_PASSWORD_LENGTH} belgi bo'lsin`);
      return;
    }
    if (newPassword !== confirm) {
      setPwError("Parollar bir-biriga mos kelmadi");
      return;
    }
    startPw(async () => {
      const res = await changeMyPassword({ newPassword, confirm });
      if (res.ok) {
        toast("Parol yangilandi — qayta kiring", "success");
        setTimeout(() => {
          window.location.href = "/login";
        }, 1200);
      } else {
        setPwError(res.error ?? "Xatolik");
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Ma'lumotlarim</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Row icon={UserIcon} label="Ism" value={name} />
          <Row icon={Shield} label="Login" value={username} />
          <Row icon={MapPin} label="Viloyat" value={region ?? "—"} />
          <div>
            <Label htmlFor="usta-phone">Telefon</Label>
            <div className="flex gap-2">
              <Input
                id="usta-phone"
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                placeholder="+998 90 123 45 67"
              />
              <Button
                onClick={savePhone}
                disabled={phonePending || phoneValue.trim() === (phone ?? "")}
              >
                {phonePending ? "..." : "Saqlash"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parolni almashtirish</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pwError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" /> {pwError}
            </div>
          )}
          <div>
            <Label htmlFor="usta-new-password">Yangi parol</Label>
            <Input
              id="usta-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={`kamida ${MIN_PASSWORD_LENGTH} belgi`}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="usta-confirm-password">
              Yangi parolni takrorlang
            </Label>
            <Input
              id="usta-confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button onClick={savePassword} disabled={pwPending}>
            <KeyRound className="h-4 w-4" />
            {pwPending ? "..." : "Parolni almashtirish"}
          </Button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Parol almashgach avtomatik chiqasiz — yangi parol bilan qayta
            kiring.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
      <span className="w-20 text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-900 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}
