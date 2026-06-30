"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, AlertCircle } from "lucide-react";
import { sendNotification } from "@/actions/notifications";
import { toast } from "@/components/toaster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function NotificationComposer() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [audience, setAudience] = useState("ALL");
  const [telegram, setTelegram] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    if (!title.trim()) return setError("Sarlavha kiriting");
    if (!body.trim()) return setError("Matn kiriting");
    start(async () => {
      const res = await sendNotification({ title, body, priority, audience, telegram });
      if (res.ok) {
        setTitle("");
        setBody("");
        setTelegram(false);
        toast(`Yuborildi — ${res.sent} ta xodim`, "success");
        router.refresh();
      } else {
        setError(res.error ?? "Xatolik");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Yangi bildirishnoma</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <div>
          <Label htmlFor="n-title">Sarlavha</Label>
          <Input
            id="n-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="masalan: Ertangi yig'ilish"
            maxLength={200}
          />
        </div>
        <div>
          <Label htmlFor="n-body">Matn</Label>
          <Textarea
            id="n-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Bildirishnoma matni..."
            className="min-h-[90px]"
            maxLength={4000}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="n-audience">Kimga</Label>
            <Select id="n-audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="ALL">Barcha xodimlar</option>
              <option value="OPERATOR">Operatorlar</option>
              <option value="MANAGER">Menejerlar</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="n-priority">Muhimlik</Label>
            <Select id="n-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="NORMAL">Oddiy</option>
              <option value="IMPORTANT">Muhim</option>
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={telegram}
            onChange={(e) => setTelegram(e.target.checked)}
            className="h-4 w-4"
          />
          Telegram orqali ham yuborish (telegrami ulangan xodimlarga)
        </label>
        <Button onClick={submit} disabled={pending}>
          <Send className="h-4 w-4" />
          {pending ? "Yuborilmoqda..." : "Yuborish"}
        </Button>
      </CardContent>
    </Card>
  );
}
