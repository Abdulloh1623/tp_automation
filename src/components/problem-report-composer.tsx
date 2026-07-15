"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, AlertCircle, LifeBuoy } from "lucide-react";
import { reportToAdmin } from "@/actions/notifications";
import { toast } from "@/components/toaster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Xodim/menejer tizimdagi muammoni adminga xabar qiladi. */
export function ProblemReportComposer() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    if (!title.trim()) return setError("Mavzu kiriting");
    if (!body.trim()) return setError("Muammo tafsilotini yozing");
    start(async () => {
      const res = await reportToAdmin({ title, body });
      if (res.ok) {
        setTitle("");
        setBody("");
        toast("Adminga yuborildi", "success");
        router.refresh();
      } else {
        setError(res.error ?? "Xatolik");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          Adminga muammo xabari
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Tizimda muammo yoki savol bo'lsa — administratorga xabar yuboring.
        </p>
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <div>
          <Label htmlFor="pr-title">Mavzu</Label>
          <Input
            id="pr-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="masalan: To'lov cheki yuklanmayapti"
            maxLength={200}
          />
        </div>
        <div>
          <Label htmlFor="pr-body">Tafsilot</Label>
          <Textarea
            id="pr-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Muammoni batafsil yozing: nima qilyapsiz va nima bo'lyapti..."
            className="min-h-[90px]"
            maxLength={4000}
          />
        </div>
        <Button onClick={submit} disabled={pending}>
          <Send className="h-4 w-4" />
          {pending ? "Yuborilmoqda..." : "Adminga yuborish"}
        </Button>
      </CardContent>
    </Card>
  );
}
