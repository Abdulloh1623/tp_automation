"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "@/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

const initialState: LoginState = {};

// Test loyiha — har rol uchun namuna akkaunt (barcha parol: parol123)
const DEMO = [
  { role: "Administrator", username: "admin" },
  { role: "Boshliq (manager)", username: "boshliq" },
  { role: "Operator", username: "abdulla" },
];
const DEMO_PASS = "parol123";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="username">Login</Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Parol</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {state.error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {state.error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Kirilmoqda..." : "Kirish"}
        </Button>
      </form>

      {/* Test akkauntlari — FAQAT dev rejimida ko'rinadi (production'da maxfiy) */}
      {process.env.NODE_ENV !== "production" && (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
        <div className="mb-2 text-xs font-medium text-slate-500">
          Test akkauntlari (bosib to'ldiring):
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {DEMO.map((d) => (
            <button
              key={d.username}
              type="button"
              onClick={() => {
                setUsername(d.username);
                setPassword(DEMO_PASS);
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs transition-colors hover:border-blue-400 hover:bg-blue-50"
            >
              <div className="font-medium text-slate-800">{d.role}</div>
              <div className="text-slate-500">{d.username} / {DEMO_PASS}</div>
            </button>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          Barcha foydalanuvchilar paroli: <b className="text-slate-600">parol123</b>{" "}
          · boshqa operatorlar: biloliddin, javohir, mehroj
        </div>
      </div>
      )}
    </div>
  );
}
