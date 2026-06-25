"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { canMutateClient } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { callResultLabel } from "@/lib/constants";

const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];

function s(v: FormDataEntryValue | null): string | undefined {
  const str = typeof v === "string" ? v.trim() : "";
  return str === "" ? undefined : str;
}

const callLogSchema = z.object({
  result: z.string().min(1, "Natijani tanlang"),
  note: z.string().optional(),
  nextFollowUpDate: z.string().optional(),
});

export type CallLogFormState = { error?: string };

export async function addCallLog(
  clientId: string,
  _prev: CallLogFormState,
  formData: FormData,
): Promise<CallLogFormState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };
  const session = g.session;
  if (!(await canMutateClient(session, clientId))) {
    return { error: "Bu mijoz sizga biriktirilmagan" };
  }

  const parsed = callLogSchema.safeParse({
    result: s(formData.get("result")),
    note: s(formData.get("note")),
    nextFollowUpDate: s(formData.get("nextFollowUpDate")),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Maʼlumotlar noto'g'ri" };
  }

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { error: "Mijoz topilmadi" };

  await db.callLog.create({
    data: {
      clientId,
      result: parsed.data.result,
      note: parsed.data.note ?? null,
      nextFollowUpDate: parsed.data.nextFollowUpDate
        ? new Date(parsed.data.nextFollowUpDate)
        : null,
      operatorId: session.userId,
    },
  });

  await logAudit("Qo'ng'iroq yozildi", {
    entity: "Client",
    entityId: clientId,
    detail: `${client.restaurantName}: ${callResultLabel(parsed.data.result)}`,
  });
  revalidatePath(`/mijozlar/${clientId}`);
  revalidatePath("/");
  return {};
}
