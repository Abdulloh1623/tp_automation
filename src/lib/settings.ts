import { db } from "@/lib/db";
import {
  DEFAULT_LEAD_PROFILE,
  isLeadProfileId,
  type LeadProfileId,
} from "@/lib/constants";
import { tzDayKey } from "@/lib/tz";

// Global kalit-qiymat sozlamalar (AppSetting): `statsResetAt` va kunlik fokus.

const STATS_RESET_KEY = "statsResetAt";
const LEAD_PROFILE_KEY = "leadPriorityProfile";
const LEAD_PROFILE_OVERRIDE_KEY = "leadPriorityOverride";

/**
 * Tablo (jonli taxta) ko'rsatkichlari shu sanadan boshlab hisoblanadi. null =
 * chegara yo'q (barcha tarix). CallLog o'chirilmaydi — faqat analitika filtri.
 */
export async function getStatsResetAt(): Promise<Date | null> {
  const row = await db.appSetting.findUnique({ where: { key: STATS_RESET_KEY } });
  if (!row) return null;
  const d = new Date(row.value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Tablo hisob boshlanish sanasini o'rnatadi (odatda "bugun 00:00"). */
export async function setStatsResetAt(at: Date): Promise<void> {
  await db.appSetting.upsert({
    where: { key: STATS_RESET_KEY },
    create: { key: STATS_RESET_KEY, value: at.toISOString() },
    update: { value: at.toISOString() },
  });
}

/** Chegarani olib tashlaydi (butun tarix qayta hisobga olinadi). */
export async function clearStatsResetAt(): Promise<void> {
  await db.appSetting.deleteMany({ where: { key: STATS_RESET_KEY } });
}

// --- Kunlik fokus (lid ustuvorlik profili) ---

export type ActiveLeadProfile = {
  id: LeadProfileId;
  /** true — bu profil FAQAT bugunga tanlangan (ertaga doimiysiga qaytadi). */
  todayOnly: boolean;
  /** Doimiy (fon) profil — override bo'lganda ham ko'rsatiladi. */
  defaultId: LeadProfileId;
};

/**
 * Bugun amal qiladigan profil. Doimiy profil ustiga "faqat bugunga" tanlov
 * qo'yilishi mumkin — u UTC+5 kuni bo'yicha bog'lanadi va ertaga o'zi
 * kuchsizlanadi (admin har kuni qaror qilishga majbur emas: unutilsa, tizim
 * doimiy profil bilan ishlayveradi).
 */
export async function getActiveLeadProfile(now = new Date()): Promise<ActiveLeadProfile> {
  const rows = await db.appSetting.findMany({
    where: { key: { in: [LEAD_PROFILE_KEY, LEAD_PROFILE_OVERRIDE_KEY] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const raw = byKey.get(LEAD_PROFILE_KEY);
  const defaultId = isLeadProfileId(raw) ? raw : DEFAULT_LEAD_PROFILE;

  const overrideRaw = byKey.get(LEAD_PROFILE_OVERRIDE_KEY);
  if (overrideRaw) {
    try {
      const o = JSON.parse(overrideRaw) as { day?: string; profile?: string };
      if (o.day === tzDayKey(now) && isLeadProfileId(o.profile)) {
        return { id: o.profile, todayOnly: true, defaultId };
      }
    } catch {
      // buzilgan qiymat — e'tiborsiz qoldiramiz, doimiy profil ishlaydi
    }
  }
  return { id: defaultId, todayOnly: false, defaultId };
}

/**
 * Fokus profilini o'rnatadi. `todayOnly` — faqat bugungi kunga (doimiy profil
 * o'zgarmaydi); aks holda doimiy profil almashadi va bugungi override olib
 * tashlanadi (aks holda eski override yangi doimiyni bekitib qolardi).
 */
export async function setLeadProfile(
  id: LeadProfileId,
  todayOnly: boolean,
  now = new Date(),
): Promise<void> {
  if (todayOnly) {
    const value = JSON.stringify({ day: tzDayKey(now), profile: id });
    await db.appSetting.upsert({
      where: { key: LEAD_PROFILE_OVERRIDE_KEY },
      create: { key: LEAD_PROFILE_OVERRIDE_KEY, value },
      update: { value },
    });
    return;
  }
  await db.appSetting.upsert({
    where: { key: LEAD_PROFILE_KEY },
    create: { key: LEAD_PROFILE_KEY, value: id },
    update: { value: id },
  });
  await db.appSetting.deleteMany({ where: { key: LEAD_PROFILE_OVERRIDE_KEY } });
}
