// Avtomatik backup: PostgreSQL pg_dump (gzip) + cheklar nusxasi (lokal) +
// DB nusxasini Telegram zaxira kanaliga (off-site).
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { gzipSync } from "zlib";
import { sendBackupToChannel } from "./telegram";
import { backupEncryptionEnabled, encryptBackup } from "./backup-crypto";
import { getDiskUsage } from "./disk";

const ROOT = process.cwd();
const BACKUPS_DIR = path.join(ROOT, "backups");
const RECEIPTS_DIR = path.join(ROOT, "uploads", "receipts");
const KEEP = 14;

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export type BackupResult = {
  ok: boolean;
  name?: string;
  receipts?: number;
  sizeKb?: number;
  telegram?: string;
  /** Telegramga yuborilgan nusxa shifrlanganmi. */
  encrypted?: boolean;
  error?: string;
};

/** Buyruqni ishga tushiradi va stdout'ni Buffer sifatida qaytaradi. */
export function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { maxBuffer: 1024 * 1024 * 256, encoding: "buffer", env: env ?? process.env },
      (err, stdout) => (err ? reject(err) : resolve(stdout as Buffer)),
    );
  });
}

export function parseDbUrl(url: string) {
  const u = new URL(url);
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: u.port || "5432",
    database: u.pathname.replace(/^\//, "").split("?")[0],
  };
}

/**
 * PostgreSQL'ni pg_dump qiladi. Avval host'dagi `pg_dump` (URL bilan — production),
 * bo'lmasa Docker konteyner orqali (dev). Natija — SQL matni (Buffer).
 */
async function pgDump(): Promise<Buffer> {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("postgres")) {
    throw new Error("DATABASE_URL PostgreSQL emas — pg_dump o'tkazib yuborildi");
  }
  const cfg = parseDbUrl(url);
  const dumpArgs = ["--no-owner", "--no-acl", "--clean", "--if-exists"];
  // MUHIM: pg_dump'ni to'liq URL bilan chaqirMAYMIZ — Prisma URL'idagi
  // `?schema=public` libpq uchun yaroqsiz query param bo'lib, pg_dump
  // "invalid URI query parameter: schema" xatosini beradi. Buning o'rniga
  // aniq -h/-p/-U/-d va parolni PGPASSWORD orqali uzatamiz.
  const connArgs = ["-h", cfg.host, "-p", cfg.port, "-U", cfg.user, "-d", cfg.database];
  const dumpEnv = { ...process.env, PGPASSWORD: cfg.password };

  try {
    // 1) Host/image ichida pg_dump bor (production: postgresql-client-16)
    return await run("pg_dump", [...connArgs, ...dumpArgs], dumpEnv);
  } catch (primaryErr) {
    // 2) Lokal dev: host'da pg_dump yo'q bo'lsa — Docker konteyner orqali.
    const container = process.env.PG_CONTAINER || "tp-postgres";
    try {
      // PGPASSWORD ni argument sifatida BERMAYMIZ — u `ps` chiqishida
      // ko'rinadi. `docker exec -e PGPASSWORD` qiymatni jarayon muhitidan oladi.
      return await run("docker", [
        "exec",
        "-e",
        "PGPASSWORD",
        container,
        "pg_dump",
        "-U",
        cfg.user,
        "-d",
        cfg.database,
        ...dumpArgs,
      ], dumpEnv);
    } catch {
      // Fallback ham ishlamadi (prod'da docker yo'q) — birlamchi pg_dump
      // xatosini ko'rsatamiz, chalg'ituvchi "spawn docker ENOENT" o'rniga.
      throw primaryErr;
    }
  }
}

async function prune(keep = KEEP) {
  try {
    const entries = await fs.readdir(BACKUPS_DIR, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && e.name !== "pre-deploy")
      .map((e) => e.name)
      .sort();
    for (let i = 0; i < dirs.length - keep; i++) {
      await fs.rm(path.join(BACKUPS_DIR, dirs[i]), { recursive: true, force: true });
    }
  } catch {
    /* backups papkasi hali yo'q */
  }
}

/**
 * Chekni backup papkasiga bog'laydi (hard link) — nusxa OLMAYDI.
 *
 * Cheklar yuklangach o'zgarmaydi, shuning uchun link xavfsiz: fayl `uploads`dan
 * o'chirilsa ham backupdagi ma'lumot saqlanadi, lekin disk joyi ikkilanmaydi.
 * Ilgari har kunlik backup HAMMA cheklarni to'liq nusxalardi va 14 kun
 * saqlanardi (cheklar hajmi × 14) — 2026-07-26 da diskni to'ldirgan asosiy
 * sabab shu. Link ishlamasa (boshqa fayl tizimi — EXDEV) nusxaga qaytamiz.
 */
async function linkOrCopy(src: string, dest: string): Promise<void> {
  try {
    await fs.link(src, dest);
  } catch {
    await fs.copyFile(src, dest);
  }
}

export async function createBackup(): Promise<BackupResult> {
  try {
    // 0) Disk to'la bo'lsa yozib bo'lmaydi (va postgres ham yozolmay qoladi).
    //    Avval eski backuplarni qattiqroq tozalaymiz; baribir joy bo'lmasa
    //    xato qaytaramiz — xato kanaliga ogohlantirish boradi.
    const disk = await getDiskUsage(ROOT);
    if (disk && disk.freeGb < 1) {
      await prune(3);
      const after = await getDiskUsage(ROOT);
      if (after && after.freeGb < 1) {
        return {
          ok: false,
          error:
            `Diskda joy yo'q (${after.freeGb} GB bo'sh / ${after.totalGb} GB) — backup o'tkazib yuborildi. ` +
            `Zudlik bilan tozalang: docker system prune -af · du -sh backups uploads`,
        };
      }
    }

    const name = stamp();
    const dir = path.join(BACKUPS_DIR, name);
    await fs.mkdir(dir, { recursive: true });

    // 1) PostgreSQL dump (gzip)
    const sql = await pgDump();
    const gz = gzipSync(sql);
    const dumpName = `db-${name}.sql.gz`;
    await fs.writeFile(path.join(dir, dumpName), gz);
    const sizeKb = Math.round(gz.length / 1024);

    // 2) Cheklar — hard link (nusxa emas): disk joyi ikkilanmaydi
    let receipts = 0;
    try {
      const files = await fs.readdir(RECEIPTS_DIR);
      if (files.length) {
        const rdir = path.join(dir, "receipts");
        await fs.mkdir(rdir, { recursive: true });
        for (const f of files) {
          await linkOrCopy(path.join(RECEIPTS_DIR, f), path.join(rdir, f));
          receipts++;
        }
      }
    } catch {
      /* cheklar yo'q */
    }

    // 3) Eski backuplarni tozalash (oxirgi KEEP ta qoladi)
    await prune();

    // 4) Dump'ni Telegram zaxira kanaliga (off-site).
    //
    // MUHIM: off-site nusxa SHIFRLANADI. Lokal nusxa (yuqorida) shifrlanmaydi —
    // u serverning o'zida turadi va tiklashda tez kerak bo'ladi; Telegramdagi
    // nusxa esa bizning nazoratimizdan tashqarida saqlanadi va bot tokeni
    // sizsa o'qib olinishi mumkin.
    const encrypted = backupEncryptionEnabled();
    let telegram = "skip";
    try {
      const payload = encrypted
        ? encryptBackup(gz, process.env.BACKUP_ENCRYPTION_KEY as string)
        : gz;
      const outName = encrypted ? `${dumpName}.enc` : dumpName;
      const caption = encrypted
        ? `🔒 Backup ${name} · ${Math.round(payload.length / 1024)} KB (shifrlangan)`
        : `⚠️ Backup ${name} · ${sizeKb} KB — SHIFRLANMAGAN (BACKUP_ENCRYPTION_KEY qo'yilmagan)`;
      const res = await sendBackupToChannel(payload, outName, caption);
      telegram = res.ok ? (res.mode === "log" ? "log" : "yuborildi") : `xato: ${res.error}`;
    } catch (e) {
      telegram = "xato: " + (e instanceof Error ? e.message : String(e));
    }

    return { ok: true, name, receipts, sizeKb, telegram, encrypted };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
