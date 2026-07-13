// Avtomatik backup: PostgreSQL pg_dump (gzip) + cheklar nusxasi (lokal) +
// DB nusxasini Telegram zaxira kanaliga (off-site).
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { gzipSync } from "zlib";
import { sendBackupToChannel } from "./telegram";

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
  error?: string;
};

/** Buyruqni ishga tushiradi va stdout'ni Buffer sifatida qaytaradi. */
function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { maxBuffer: 1024 * 1024 * 256, encoding: "buffer", env: env ?? process.env },
      (err, stdout) => (err ? reject(err) : resolve(stdout as Buffer)),
    );
  });
}

function parseDbUrl(url: string) {
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
      return await run("docker", [
        "exec",
        "-e",
        `PGPASSWORD=${cfg.password}`,
        container,
        "pg_dump",
        "-U",
        cfg.user,
        "-d",
        cfg.database,
        ...dumpArgs,
      ]);
    } catch {
      // Fallback ham ishlamadi (prod'da docker yo'q) — birlamchi pg_dump
      // xatosini ko'rsatamiz, chalg'ituvchi "spawn docker ENOENT" o'rniga.
      throw primaryErr;
    }
  }
}

async function prune() {
  try {
    const entries = await fs.readdir(BACKUPS_DIR, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (let i = 0; i < dirs.length - KEEP; i++) {
      await fs.rm(path.join(BACKUPS_DIR, dirs[i]), { recursive: true, force: true });
    }
  } catch {
    /* backups papkasi hali yo'q */
  }
}

export async function createBackup(): Promise<BackupResult> {
  try {
    const name = stamp();
    const dir = path.join(BACKUPS_DIR, name);
    await fs.mkdir(dir, { recursive: true });

    // 1) PostgreSQL dump (gzip)
    const sql = await pgDump();
    const gz = gzipSync(sql);
    const dumpName = `db-${name}.sql.gz`;
    await fs.writeFile(path.join(dir, dumpName), gz);
    const sizeKb = Math.round(gz.length / 1024);

    // 2) Cheklar nusxa
    let receipts = 0;
    try {
      const files = await fs.readdir(RECEIPTS_DIR);
      if (files.length) {
        const rdir = path.join(dir, "receipts");
        await fs.mkdir(rdir, { recursive: true });
        for (const f of files) {
          await fs.copyFile(path.join(RECEIPTS_DIR, f), path.join(rdir, f));
          receipts++;
        }
      }
    } catch {
      /* cheklar yo'q */
    }

    // 3) Eski backuplarni tozalash (oxirgi KEEP ta qoladi)
    await prune();

    // 4) Dump'ni Telegram zaxira kanaliga (off-site)
    let telegram = "skip";
    try {
      const res = await sendBackupToChannel(gz, dumpName, `🗄 Backup ${name} · ${sizeKb} KB`);
      telegram = res.ok ? (res.mode === "log" ? "log" : "yuborildi") : `xato: ${res.error}`;
    } catch (e) {
      telegram = "xato: " + (e instanceof Error ? e.message : String(e));
    }

    return { ok: true, name, receipts, sizeKb, telegram };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
