// Backupdan tiklash — faylni ochish, TEKSHIRISH va (alohida qadamda) tiklash.
//
// XAVFSIZLIK/EHTIYOTKORLIK: haqiqiy tiklash butun bazani almashtiradi. Shuning
// uchun oqim ikki bosqichli:
//
//   1) TEKSHIRISH — fayl ochiladi (shifr + gzip), ichidagi jadval/qatorlar
//      sanaladi, ixtiyoriy ravishda VAQTINCHALIK bazaga tiklab ko'riladi.
//      Jonli bazaga UMUMAN tegilmaydi.
//   2) TIKLASH — faqat tekshiruvdan o'tgan fayl uchun; avval joriy bazadan
//      backup olinadi, so'ng dump qo'llanadi.
//
// `inspectDump` SOF funksiya (DB kerak emas) — shu bois tez ishlaydi va
// to'liq testlanadi. Haqiqiy tiklash esa `psql` ga tayanadi (image ichida
// postgresql-client-16 bor).

import { gunzipSync } from "zlib";
import { randomUUID } from "crypto";
import { parseDbUrl } from "./backup";
import { decryptBackup } from "./backup-crypto";

/** `createBackup` qaysi jadvallarni yozadi — tekshiruvda shular kutiladi. */
export const CORE_TABLES = ["User", "Client", "Payment", "CallLog"] as const;

export type TableCount = { table: string; rows: number };

export type DumpInfo = {
  /** Jadval nomi -> qatorlar soni (COPY bloklaridan sanaladi). */
  tables: TableCount[];
  /** Umumiy qatorlar. */
  totalRows: number;
  /** pg_dump versiyasi (izohdan), topilsa. */
  pgDumpVersion: string | null;
  /** Asosiy jadvallardan qaysilari yo'q (bo'sh bo'lsa — hammasi joyida). */
  missingCoreTables: string[];
};

/**
 * Yuklangan faylni xom SQL matnigacha ochadi.
 *
 * Qo'llab-quvvatlanadigan kirish: `.sql.gz.enc` (shifrlangan), `.sql.gz`, `.sql`.
 * Shifrlangan fayl uchun kalit shart.
 */
export function openBackupFile(
  data: Buffer,
  opts: { encryptionKey?: string } = {},
): { ok: true; sql: string } | { ok: false; error: string } {
  let buf = data;

  // 1) Shifrlanganmi? (backup-crypto sarlavhasi "TPBK1")
  if (buf.subarray(0, 5).toString("utf8") === "TPBK1") {
    if (!opts.encryptionKey) {
      return { ok: false, error: "Fayl shifrlangan — BACKUP_ENCRYPTION_KEY kerak" };
    }
    try {
      buf = decryptBackup(buf, opts.encryptionKey);
    } catch {
      return { ok: false, error: "Shifrni ochib bo'lmadi — kalit noto'g'ri yoki fayl buzilgan" };
    }
  }

  // 2) Gzip'mi? (1f 8b sehrli baytlari)
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      buf = gunzipSync(buf);
    } catch {
      return { ok: false, error: "Gzip ochilmadi — fayl buzilgan" };
    }
  }

  const sql = buf.toString("utf8");
  if (!looksLikePgDump(sql)) {
    return {
      ok: false,
      error: "Bu PostgreSQL dump fayliga o'xshamaydi (pg_dump sarlavhasi topilmadi)",
    };
  }
  return { ok: true, sql };
}

/** Matn pg_dump chiqishimi? Tasodifiy faylni bazaga qo'llab yubormaslik uchun. */
export function looksLikePgDump(sql: string): boolean {
  const head = sql.slice(0, 4000);
  return (
    head.includes("PostgreSQL database dump") ||
    /^\s*(SET|CREATE TABLE|COPY|DROP TABLE|ALTER TABLE)\b/m.test(head)
  );
}

/**
 * Dump matnini o'qib, ichidagi jadval va qatorlar sonini chiqaradi.
 *
 * pg_dump (plain format) ma'lumotni `COPY public."Client" (...) FROM stdin;`
 * bloklarida beradi; blok `\.` bilan tugaydi. Qatorlarni shu bloklardan
 * sanaymiz — bu bazaga umuman tegmasdan "fayl ichida nima bor" degan savolga
 * javob beradi.
 */
export function inspectDump(sql: string): DumpInfo {
  const tables: TableCount[] = [];
  const lines = sql.split("\n");
  let pgDumpVersion: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!pgDumpVersion) {
      const m = /^--\s*Dumped by pg_dump version\s+(.+)$/.exec(line.trim());
      if (m) pgDumpVersion = m[1].trim();
    }

    // COPY public."Client" (id, ...) FROM stdin;
    const copy = /^COPY\s+(?:[\w."]+\.)?"?([A-Za-z_][\w]*)"?\s*\(.*\)\s+FROM\s+stdin;/.exec(line);
    if (!copy) continue;

    const table = copy[1];
    let rows = 0;
    i++;
    // Blok oxiri — alohida qatordagi `\.`
    while (i < lines.length && lines[i] !== "\\.") {
      // Oxirgi qator "\n" tufayli bo'sh bo'lishi mumkin — uni sanamaymiz.
      if (lines[i] !== "") rows++;
      i++;
    }
    tables.push({ table, rows });
  }

  // Bir jadval bir necha COPY blokida kelsa — birlashtiramiz.
  const merged = new Map<string, number>();
  for (const t of tables) merged.set(t.table, (merged.get(t.table) ?? 0) + t.rows);
  const list = [...merged.entries()]
    .map(([table, rows]) => ({ table, rows }))
    .sort((a, b) => b.rows - a.rows);

  const present = new Set(list.map((t) => t.table));
  return {
    tables: list,
    totalRows: list.reduce((s, t) => s + t.rows, 0),
    pgDumpVersion,
    missingCoreTables: CORE_TABLES.filter((t) => !present.has(t)),
  };
}

/** Tekshiruv natijasi — UI shu ko'rinishda ko'rsatadi. */
export type VerifyResult = {
  ok: boolean;
  /** Fayl ichidagi statistika (matn bo'yicha). */
  info?: DumpInfo;
  /** Vaqtinchalik bazaga haqiqatan tiklab ko'rildimi. */
  restored?: boolean;
  /** Tiklangandan keyin bazadan olingan sonlar (matn bilan solishtirish uchun). */
  actual?: TableCount[];
  error?: string;
  warnings: string[];
};

function adminUrl(): { cfg: ReturnType<typeof parseDbUrl>; env: NodeJS.ProcessEnv } {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("postgres")) throw new Error("DATABASE_URL PostgreSQL emas");
  const cfg = parseDbUrl(url);
  return { cfg, env: { ...process.env, PGPASSWORD: cfg.password } };
}

function connArgs(cfg: ReturnType<typeof parseDbUrl>, database: string): string[] {
  return ["-h", cfg.host, "-p", cfg.port, "-U", cfg.user, "-d", database];
}

/**
 * `psql` ni ishga tushiradi. Avval host'dagi psql (production image'da
 * postgresql-client-16 bor), bo'lmasa Docker konteyner orqali (lokal dev).
 * backup.ts dagi pg_dump bilan bir xil yondashuv.
 *
 * Konteyner ichida ulanish lokal soket orqali ketadi — shu bois u yerda
 * -h/-p BERILMAYDI (host'dagi 5433 port konteyner ichida boshqa narsa).
 */
async function runPsql(
  cfg: ReturnType<typeof parseDbUrl>,
  env: NodeJS.ProcessEnv,
  database: string,
  args: string[],
  stdin?: string,
): Promise<Buffer> {
  try {
    return await execWithStdin("psql", [...connArgs(cfg, database), ...args], env, stdin);
  } catch (primaryErr) {
    if (!isMissingBinary(primaryErr)) throw primaryErr;
    const container = process.env.PG_CONTAINER || "tp-postgres";
    return execWithStdin(
      "docker",
      ["exec", "-i", "-e", "PGPASSWORD", container, "psql", "-U", cfg.user, "-d", database, ...args],
      env,
      stdin,
    );
  }
}

/** Buyruq topilmadimi (host'da psql/docker yo'q)? */
function isMissingBinary(e: unknown): boolean {
  return /ENOENT|not found|not recognized/i.test(msg(e));
}

/** execFile + ixtiyoriy stdin. */
async function execWithStdin(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  stdin?: string,
): Promise<Buffer> {
  const { execFile } = await import("child_process");
  return new Promise<Buffer>((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      { env, maxBuffer: 1024 * 1024 * 256, encoding: "buffer" },
      (err, stdout, stderr) =>
        err
          ? reject(new Error(String(stderr?.toString() || err.message).slice(0, 2000)))
          : resolve(stdout as Buffer),
    );
    if (stdin !== undefined) child.stdin?.end(stdin);
  });
}

/**
 * Dump'ni VAQTINCHALIK bazaga tiklab ko'radi va qatorlarni sanaydi, so'ng
 * bazani o'chiradi. Jonli bazaga tegmaydi.
 *
 * Shu funksiya "backup haqiqatan tiklanadimi" degan savolga yagona ishonchli
 * javob beradi — matn tahlili faylning to'liqligini isbotlay olmaydi.
 */
export async function verifyByRestore(sql: string): Promise<VerifyResult> {
  const warnings: string[] = [];
  const info = inspectDump(sql);
  if (info.missingCoreTables.length > 0) {
    warnings.push(`Asosiy jadvallar topilmadi: ${info.missingCoreTables.join(", ")}`);
  }

  const { cfg, env } = adminUrl();
  // Nomda faqat harf/raqam — SQL identifikatoriga xavfsiz qo'shish uchun.
  const scratch = `tp_verify_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  try {
    await runPsql(cfg, env, "postgres", ["-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE "${scratch}"`]);
  } catch (e) {
    return {
      ok: false,
      info,
      warnings,
      error: `Vaqtinchalik baza yaratilmadi: ${msg(e)}`,
    };
  }

  try {
    await psqlExec(cfg, env, scratch, sql);
    const actual = await countRows(cfg, env, scratch);
    // Matn tahlili bilan haqiqiy sonlarni solishtiramiz — farq bo'lsa dump
    // to'liq qo'llanmagan degani.
    for (const t of info.tables) {
      const got = actual.find((a) => a.table === t.table);
      if (got && got.rows !== t.rows) {
        warnings.push(`${t.table}: faylda ${t.rows}, tiklangach ${got.rows} qator`);
      }
    }
    return { ok: true, info, restored: true, actual, warnings };
  } catch (e) {
    return { ok: false, info, restored: false, warnings, error: msg(e) };
  } finally {
    try {
      await runPsql(cfg, env, "postgres", ["-c", `DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`]);
    } catch {
      warnings.push(`Vaqtinchalik baza o'chmadi: ${scratch} — qo'lda o'chiring`);
    }
  }
}

/** SQL matnini psql'ga stdin orqali beradi. */
async function psqlExec(
  cfg: ReturnType<typeof parseDbUrl>,
  env: NodeJS.ProcessEnv,
  database: string,
  sql: string,
): Promise<void> {
  await runPsql(cfg, env, database, ["-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], sql);
}

/** Bazadagi haqiqiy qatorlar sonini oladi (asosiy jadvallar bo'yicha). */
async function countRows(
  cfg: ReturnType<typeof parseDbUrl>,
  env: NodeJS.ProcessEnv,
  database: string,
): Promise<TableCount[]> {
  const union = CORE_TABLES.map(
    (t) => `SELECT '${t}' AS t, count(*) AS c FROM "${t}"`,
  ).join(" UNION ALL ");
  const out = await runPsql(cfg, env, database, ["-t", "-A", "-F", "|", "-c", union]);
  return out
    .toString("utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [table, c] = l.split("|");
      return { table, rows: Number(c) || 0 };
    });
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// HAQIQIY TIKLASH
// ---------------------------------------------------------------------------

export type RestoreResult = {
  ok: boolean;
  /** Tiklashdan OLDIN olingan xavfsizlik nusxasi (rollback uchun). */
  safetyBackup?: string;
  /** Tiklangandan keyin bazadagi sonlar. */
  actual?: TableCount[];
  error?: string;
};

/**
 * Dump'ni JONLI bazaga qo'llaydi. BU AMAL BUTUN BAZANI ALMASHTIRADI.
 *
 * Chaqirishdan oldin (chaqiruvchining mas'uliyati):
 *  1. fayl `verifyByRestore` dan muvaffaqiyatli o'tgan bo'lsin;
 *  2. texnik tanaffus yoqilgan bo'lsin — aks holda xodimlar kiritayotgan
 *     ma'lumot tiklash bilan yo'qoladi.
 *
 * Shu yerda esa har doim bajariladi: tiklashdan oldin joriy bazadan
 * XAVFSIZLIK NUSXASI olinadi (xato tiklashdan qaytish uchun yagona yo'l).
 */
export async function restoreToLive(sql: string): Promise<RestoreResult> {
  // 1) Xavfsizlik nusxasi — bu MUVAFFAQIYATSIZ bo'lsa, tiklash BOSHLANMAYDI.
  let safetyBackup: string | undefined;
  try {
    const { createBackup } = await import("./backup");
    const res = await createBackup();
    if (!res.ok || !res.name) {
      return { ok: false, error: `Xavfsizlik nusxasi olinmadi (${res.error}) — tiklash bekor qilindi` };
    }
    safetyBackup = res.name;
  } catch (e) {
    return { ok: false, error: `Xavfsizlik nusxasi olinmadi (${msg(e)}) — tiklash bekor qilindi` };
  }

  // 2) Dump'ni qo'llaymiz. pg_dump --clean --if-exists bilan olingani uchun
  //    ichida DROP + CREATE bor; alohida tozalash shart emas.
  const { cfg, env } = adminUrl();
  try {
    await psqlExec(cfg, env, cfg.database, sql);
  } catch (e) {
    return {
      ok: false,
      safetyBackup,
      error: `Tiklash xatosi: ${msg(e)}. Baza nomuvofiq holatda bo'lishi mumkin — ` +
        `xavfsizlik nusxasi: backups/${safetyBackup}`,
    };
  }

  // 3) Natijani sanaymiz.
  try {
    const actual = await countRows(cfg, env, cfg.database);
    return { ok: true, safetyBackup, actual };
  } catch (e) {
    return { ok: true, safetyBackup, error: `Tiklandi, lekin sanoq olinmadi: ${msg(e)}` };
  }
}
