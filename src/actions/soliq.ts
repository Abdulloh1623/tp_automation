"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { saveSoliqDoc } from "@/lib/soliq-docs";

type State = { ok: boolean; error?: string };

const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];
const MANAGERS = ["ADMIN", "MANAGER"];

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

const submitSchema = z.object({
  certificateNo: z.string().min(1, "Firma guvohnomasi raqamini kiriting").max(120, "Juda uzun"),
  directorName: z.string().min(1, "Firma rahbarining F.I.Sh kiriting").max(200, "Juda uzun"),
  directorPhone: z.string().min(3, "Rahbar telefon raqamini kiriting").max(40, "Juda uzun"),
  geoLink: z.string().min(1, "Geolokatsiya linkini kiriting").max(1000, "Juda uzun"),
  note: z.string().max(500, "Izoh juda uzun").optional(),
});

/** FormData'dagi faylni o'qib uploads/soliq/ ga saqlaydi. */
async function saveField(
  formData: FormData,
  field: string,
): Promise<{ ok: true; relPath: string } | { ok: false; error: string }> {
  const f = formData.get(field);
  if (!(f instanceof File) || f.size === 0) {
    return { ok: false, error: "Hujjat tanlanmagan" };
  }
  const buffer = Buffer.from(await f.arrayBuffer());
  return saveSoliqDoc(buffer, f.type, randomUUID());
}

/**
 * Operator (yoki boshliq) mijozni soliqqa ulash uchun ariza yuboradi.
 * Ikkita hujjat majburiy: guvohnoma skani + kadastr/ijara shartnomasi.
 */
export async function submitTaxConnection(
  clientId: string,
  formData: FormData,
): Promise<State> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { ok: false, error: g.error };

  const parsed = submitSchema.safeParse({
    certificateNo: str(formData.get("certificateNo")),
    directorName: str(formData.get("directorName")),
    directorPhone: str(formData.get("directorPhone")),
    geoLink: str(formData.get("geoLink")),
    note: str(formData.get("note")) || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Maʼlumotlarni tekshiring" };
  }

  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true, restaurantName: true, fullName: true },
  });
  if (!client) return { ok: false, error: "Mijoz topilmadi" };

  // Bitta mijoz uchun bitta yozuv — takror yubormaslik
  const existing = await db.taxConnection.findFirst({
    where: { clientId },
    select: { status: true },
  });
  if (existing) {
    return {
      ok: false,
      error:
        existing.status === "CONNECTED"
          ? "Bu mijoz allaqachon soliqqa ulangan"
          : "Bu mijoz allaqachon soliqqa ulash navbatida",
    };
  }

  // Hujjatlarni saqlash (ikkalasi majburiy)
  const cert = await saveField(formData, "certificateDoc");
  if (!cert.ok) return { ok: false, error: `Guvohnoma skani: ${cert.error}` };
  const doc = await saveField(formData, "document");
  if (!doc.ok) return { ok: false, error: `Kadastr/ijara: ${doc.error}` };

  await db.taxConnection.create({
    data: {
      clientId,
      certificateNo: parsed.data.certificateNo,
      certificatePath: cert.relPath,
      directorName: parsed.data.directorName,
      directorPhone: parsed.data.directorPhone,
      documentPath: doc.relPath,
      geoLink: parsed.data.geoLink,
      note: parsed.data.note ?? null,
      status: "PENDING",
      byUserId: g.session.userId,
    },
  });

  await logAudit("Soliqqa ulash arizasi", {
    entity: "Client",
    entityId: clientId,
    detail: client.restaurantName || client.fullName,
  });

  // Admin/menejerlarga bildirishnoma
  const managers = await db.user.findMany({
    where: { role: { in: MANAGERS }, isActive: true },
    select: { id: true },
  });
  await createNotification({
    title: "Yangi soliqqa ulash arizasi",
    body: `${client.restaurantName || client.fullName} — soliqqa ulash uchun yuborildi`,
    userIds: managers.map((m) => m.id),
  });

  revalidatePath("/soliq");
  revalidatePath(`/mijozlar/${clientId}`);
  return { ok: true };
}

/** Boshliq: arizani "Ulandi" deb belgilaydi. */
export async function markTaxConnected(id: string): Promise<State> {
  const g = await guardRole(MANAGERS);
  if (!g.ok) return { ok: false, error: g.error };
  try {
    const tc = await db.taxConnection.update({
      where: { id },
      data: { status: "CONNECTED", connectedById: g.session.userId, connectedAt: new Date() },
      select: { clientId: true },
    });
    await logAudit("Soliqqa ulandi", { entity: "Client", entityId: tc.clientId });
    revalidatePath("/soliq");
    revalidatePath(`/mijozlar/${tc.clientId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Ariza topilmadi" };
  }
}

/** Boshliq: "Ulandi" holatini bekor qilib navbatga qaytaradi. */
export async function revertTaxConnection(id: string): Promise<State> {
  const g = await guardRole(MANAGERS);
  if (!g.ok) return { ok: false, error: g.error };
  try {
    const tc = await db.taxConnection.update({
      where: { id },
      data: { status: "PENDING", connectedById: null, connectedAt: null },
      select: { clientId: true },
    });
    await logAudit("Soliqqa ulash bekor qilindi (navbatga)", { entity: "Client", entityId: tc.clientId });
    revalidatePath("/soliq");
    revalidatePath(`/mijozlar/${tc.clientId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Ariza topilmadi" };
  }
}

/** Boshliq: arizani o'chiradi (xato yuborilgan bo'lsa). */
export async function deleteTaxConnection(id: string): Promise<State> {
  const g = await guardRole(MANAGERS);
  if (!g.ok) return { ok: false, error: g.error };
  try {
    const tc = await db.taxConnection.delete({
      where: { id },
      select: { clientId: true },
    });
    await logAudit("Soliqqa ulash arizasi o'chirildi", { entity: "Client", entityId: tc.clientId });
    revalidatePath("/soliq");
    revalidatePath(`/mijozlar/${tc.clientId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Ariza topilmadi" };
  }
}
