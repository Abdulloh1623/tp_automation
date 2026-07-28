"use server";

import { revalidatePath } from "next/cache";
import { guardRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  DEFAULT_RECALL_RULES,
  LOAD_POLICY_BOUNDS,
  MAX_RECALL_DAYS,
  leadOutcomeLabelSafe,
  mergeLoadPolicy,
  mergeRecallRules,
  type LoadPolicy,
  type RecallRules,
} from "@/lib/recall-rules";
import { getRecallSettings, setLoadPolicy, setRecallRules } from "@/lib/settings";

export type SettingsState = { ok: boolean; error?: string };

/**
 * Qayta aloqa oraliqlarini saqlaydi. Faqat ADMIN — bu butun jamoaning kunlik
 * ish hajmini belgilaydi.
 *
 * Yangi qoidalar FAQAT shundan keyingi natijalarga qo'llanadi; allaqachon
 * sana qo'yilgan mijozlarning taqvimi siljimaydi (kutilmagan ommaviy
 * o'zgarishlarning oldini oladi).
 */
export async function saveRecallRules(raw: unknown): Promise<SettingsState> {
  const g = await guardRole(["ADMIN"]);
  if (!g.ok) return { ok: false, error: g.error };

  const rules: RecallRules = mergeRecallRules(raw);
  // `mergeRecallRules` yaroqsiz qatorni jimgina standartga qaytaradi — admin
  // xatosi bilinmay qolmasin uchun kirishni alohida tekshiramiz.
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!(key in DEFAULT_RECALL_RULES)) continue;
      const v = value as { mode?: string; days?: unknown };
      const days = Number(v?.days);
      if (v?.mode !== "NONE" && (!Number.isFinite(days) || days < 0 || days > MAX_RECALL_DAYS)) {
        return {
          ok: false,
          error: `"${leadOutcomeLabelSafe(key)}" uchun kun 0–${MAX_RECALL_DAYS} oralig'ida bo'lsin`,
        };
      }
    }
  }

  await setRecallRules(rules);
  await logAudit("Qayta aloqa oraliqlari o'zgartirildi", { entity: "AppSetting" });
  revalidatePath("/sozlamalar");
  revalidatePath("/lidlar");
  return { ok: true };
}

/** Kunlik yuklama chegaralari + eskalatsiya chegarasi. Faqat ADMIN. */
export async function saveLoadPolicy(raw: unknown): Promise<SettingsState> {
  const g = await guardRole(["ADMIN"]);
  if (!g.ok) return { ok: false, error: g.error };

  const input = (raw ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(LOAD_POLICY_BOUNDS) as (keyof LoadPolicy)[]) {
    const v = Number(input[key]);
    const b = LOAD_POLICY_BOUNDS[key];
    if (!Number.isFinite(v) || v < b.min || v > b.max) {
      return { ok: false, error: `Qiymat ${b.min}–${b.max} oralig'ida bo'lishi kerak` };
    }
  }
  if (Number(input.minPerOperator) > Number(input.maxPerOperator)) {
    return { ok: false, error: "Eng kam son eng ko'pdan katta bo'lmasin" };
  }

  const policy = mergeLoadPolicy(input);
  await setLoadPolicy(policy);
  await logAudit("Kunlik yuklama sozlamasi o'zgartirildi", {
    entity: "AppSetting",
    detail:
      `eng kam ${policy.minPerOperator} · eng ko'p ${policy.maxPerOperator} · ` +
      `qarzdor oralig'i ${policy.debtorCooldownDays} kun · ` +
      `eskalatsiya ${policy.escalationThreshold} marta`,
  });
  revalidatePath("/sozlamalar");
  revalidatePath("/lidlar");
  return { ok: true };
}

/** Joriy sozlamalar (klient formasi boshlang'ich holati uchun). */
export async function readRecallSettings() {
  await guardRole(["ADMIN"]);
  return getRecallSettings();
}
