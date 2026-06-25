"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Pencil,
  KeyRound,
  Power,
  X,
  AlertCircle,
} from "lucide-react";
import {
  createUser,
  updateUser,
  resetPassword,
  setUserActive,
} from "@/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RegionMultiSelect } from "@/components/region-multi-select";
import { USER_ROLE, userRoleLabel, parseRegions } from "@/lib/constants";

export type ManagedUser = {
  id: string;
  name: string;
  username: string;
  role: string;
  region: string | null;
  regions: string | null;
  phone: string | null;
  telegramId: string | null;
  dailyLeadTarget: number;
  isActive: boolean;
};

type Mode =
  | { kind: "create" }
  | { kind: "edit"; user: ManagedUser }
  | { kind: "password"; user: ManagedUser }
  | null;

type Form = {
  name: string;
  username: string;
  password: string;
  role: string;
  regions: string[];
  phone: string;
  telegramId: string;
  dailyLeadTarget: string;
};

const emptyForm: Form = {
  name: "",
  username: "",
  password: "",
  role: "OPERATOR",
  regions: [],
  phone: "",
  telegramId: "",
  dailyLeadTarget: "20",
};

const roleTone: Record<string, "blue" | "amber" | "slate"> = {
  ADMIN: "blue",
  OPERATOR: "amber",
  INSTALLER: "slate",
};

export function UserManager({ users }: { users: ManagedUser[] }) {
  const [mode, setMode] = useState<Mode>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setMode({ kind: "create" });
  }
  function openEdit(u: ManagedUser) {
    setForm({
      name: u.name,
      username: u.username,
      password: "",
      role: u.role,
      regions: parseRegions(u.regions, u.region),
      phone: u.phone ?? "",
      telegramId: u.telegramId ?? "",
      dailyLeadTarget: String(u.dailyLeadTarget),
    });
    setError(null);
    setMode({ kind: "edit", user: u });
  }
  function openPassword(u: ManagedUser) {
    setForm({ ...emptyForm, password: "" });
    setError(null);
    setMode({ kind: "password", user: u });
  }

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit() {
    if (!mode) return;
    setError(null);
    start(async () => {
      let res;
      if (mode.kind === "create") {
        res = await createUser({
          name: form.name,
          username: form.username,
          password: form.password,
          role: form.role,
          regions: form.regions,
          phone: form.phone,
          dailyLeadTarget: form.dailyLeadTarget,
        });
      } else if (mode.kind === "edit") {
        res = await updateUser(mode.user.id, {
          name: form.name,
          role: form.role,
          regions: form.regions,
          phone: form.phone,
          telegramId: form.telegramId,
          dailyLeadTarget: form.dailyLeadTarget,
        });
      } else {
        res = await resetPassword(mode.user.id, form.password);
      }
      if (res.ok) {
        setMode(null);
        router.refresh();
      } else {
        setError(res.error ?? "Xatolik");
      }
    });
  }

  function toggleActive(u: ManagedUser) {
    start(async () => {
      const res = await setUserActive(u.id, !u.isActive);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <UserPlus className="h-4 w-4" />
          Yangi xodim
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Ism</th>
              <th className="px-4 py-3 font-medium">Login</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Viloyat</th>
              <th className="px-4 py-3 text-center font-medium">Kunlik</th>
              <th className="px-4 py-3 text-center font-medium">Telegram</th>
              <th className="px-4 py-3 text-center font-medium">Holat</th>
              <th className="px-4 py-3 text-right font-medium">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className={
                  "border-b border-slate-100 last:border-0 " +
                  (u.isActive ? "" : "opacity-50")
                }
              >
                <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                <td className="px-4 py-3 text-slate-600">{u.username}</td>
                <td className="px-4 py-3">
                  <Badge tone={roleTone[u.role] ?? "neutral"}>
                    {userRoleLabel(u.role)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {parseRegions(u.regions, u.region).join(", ") || "—"}
                </td>
                <td className="px-4 py-3 text-center text-slate-600">
                  {u.role === "OPERATOR" ? u.dailyLeadTarget : "—"}
                </td>
                <td className="px-4 py-3 text-center text-slate-600">
                  {u.telegramId ? "✓" : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  {u.isActive ? (
                    <Badge tone="green">Faol</Badge>
                  ) : (
                    <Badge tone="slate">Nofaol</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => openEdit(u)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Tahrir
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => openPassword(u)}
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Parol
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={
                        "h-7 px-2 text-xs " +
                        (u.isActive ? "text-red-600" : "text-emerald-600")
                      }
                      onClick={() => toggleActive(u)}
                      disabled={pending}
                    >
                      <Power className="h-3.5 w-3.5" />
                      {u.isActive ? "O'chirish" : "Yoqish"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setMode(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">
                {mode.kind === "create"
                  ? "Yangi xodim"
                  : mode.kind === "edit"
                    ? "Xodimni tahrirlash"
                    : "Parolni almashtirish"}
              </h3>
              <button
                onClick={() => setMode(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-3">
              {mode.kind === "password" ? (
                <div>
                  <Label htmlFor="pw">Yangi parol</Label>
                  <Input
                    id="pw"
                    type="text"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    placeholder="kamida 4 belgi"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="name">Ism</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  </div>
                  {mode.kind === "create" && (
                    <>
                      <div>
                        <Label htmlFor="username">Login</Label>
                        <Input
                          id="username"
                          value={form.username}
                          onChange={(e) => set("username", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="password">Parol</Label>
                        <Input
                          id="password"
                          type="text"
                          value={form.password}
                          onChange={(e) => set("password", e.target.value)}
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <Label htmlFor="role">Rol</Label>
                    <Select
                      id="role"
                      value={form.role}
                      onChange={(e) => set("role", e.target.value)}
                    >
                      {Object.entries(USER_ROLE).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Viloyatlar (bir nechta tanlash mumkin)</Label>
                    <RegionMultiSelect
                      value={form.regions}
                      onChange={(v) => set("regions", v)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="phone">Telefon</Label>
                      <Input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="target">Kunlik lid</Label>
                      <Input
                        id="target"
                        type="number"
                        min={0}
                        value={form.dailyLeadTarget}
                        onChange={(e) => set("dailyLeadTarget", e.target.value)}
                      />
                    </div>
                  </div>
                  {mode.kind === "edit" && (
                    <div>
                      <Label htmlFor="tg">Telegram ID</Label>
                      <Input
                        id="tg"
                        value={form.telegramId}
                        onChange={(e) => set("telegramId", e.target.value)}
                        placeholder="bot ruxsati uchun (ixtiyoriy)"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={submit} disabled={pending}>
                {pending ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
              <Button variant="ghost" onClick={() => setMode(null)}>
                Bekor
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
