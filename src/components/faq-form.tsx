"use client";

import { useState, useTransition } from "react";
import { Save, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaqEditor } from "@/components/faq-editor";
import { createFaq, updateFaq } from "@/actions/faq";
import { toast } from "@/components/toaster";

export type FaqInitial = {
  id: string;
  question: string;
  details: string | null;
  solution: string;
};

export function FaqForm({
  mode,
  initial,
  onDone,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: FaqInitial;
  onDone: () => void;
  onSaved: () => void;
}) {
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [details, setDetails] = useState(initial?.details ?? "");
  const [solution, setSolution] = useState(initial?.solution ?? "");
  const [pending, start] = useTransition();

  function submit() {
    if (question.trim().length < 3) {
      toast("Savolni kiriting (kamida 3 belgi)", "error");
      return;
    }
    if (solution.trim().length < 3) {
      toast("Yechimni kiriting (kamida 3 belgi)", "error");
      return;
    }
    const fd = new FormData();
    fd.set("question", question);
    fd.set("details", details);
    fd.set("solution", solution);
    start(async () => {
      const res =
        mode === "create" ? await createFaq(fd) : await updateFaq(initial!.id, fd);
      if (res.ok) {
        toast(mode === "create" ? "FAQ qo'shildi" : "Saqlandi", "success");
        onSaved();
        onDone();
      } else {
        toast(res.error || "Xatolik", "error");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Savol / muammo
        </label>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Masalan: Chek yuklashda xatolik chiqsa nima qilish kerak?"
          maxLength={300}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Muammo tafsiloti <span className="font-normal text-slate-400">(ixtiyoriy — skrinshot/havola qo'shsa bo'ladi)</span>
        </label>
        <FaqEditor
          value={details}
          onChange={setDetails}
          placeholder="Muammoni batafsil yozing, kerak bo'lsa skrinshot yuklang…"
          rows={4}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Yechim
        </label>
        <FaqEditor
          value={solution}
          onChange={setSolution}
          placeholder="Yechimni qadamma-qadam yozing…"
          rows={6}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={pending}>
          <X className="h-4 w-4" />
          Bekor
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === "create" ? "Qo'shish" : "Saqlash"}
        </Button>
      </div>
    </div>
  );
}
