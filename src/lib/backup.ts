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
function run(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { maxBuffer: 1024 * 1024 * 256, encoding: "buffer" },
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

  try {
    // 1) Host'da pg_dump bor (production / postgresql-client o'rnatilgan)
    return await run("pg_dump", [url, ...dumpArgs]);
  } catch {
    // 2) Docker konteyner ichidagi pg_dump (lokal dev)
    const container = process.env.PG_CONTAINER || "tp-postgres";
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
