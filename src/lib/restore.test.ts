import { describe, it, expect } from "vitest";
import { gzipSync } from "zlib";
import { inspectDump, looksLikePgDump, openBackupFile } from "./restore";
import { encryptBackup } from "./backup-crypto";

// Haqiqiy pg_dump (plain) chiqishiga o'xshash minimal namuna.
const DUMP = `--
-- PostgreSQL database dump
--

-- Dumped from database version 16.3
-- Dumped by pg_dump version 16.3

SET statement_timeout = 0;

DROP TABLE IF EXISTS public."Client";

CREATE TABLE public."Client" (
    id text NOT NULL,
    "restaurantName" text NOT NULL
);

COPY public."User" (id, username, role) FROM stdin;
u1\tadmin\tADMIN
u2\tasadbek\tOPERATOR
\\.


COPY public."Client" (id, "restaurantName") FROM stdin;
c1\tChaykhana
c2\tOsh Markazi
c3\tKafe Lazzat
\\.


COPY public."Payment" (id, amount) FROM stdin;
p1\t29
\\.


COPY public."CallLog" (id, result) FROM stdin;
\\.


--
-- PostgreSQL database dump complete
--
`;

describe("looksLikePgDump", () => {
  it("haqiqiy dump tanilади", () => {
    expect(looksLikePgDump(DUMP)).toBe(true);
    expect(looksLikePgDump('SET statement_timeout = 0;\nCREATE TABLE "x" ();')).toBe(true);
  });

  it("begona fayl rad etiladi", () => {
    expect(looksLikePgDump("shunchaki matn")).toBe(false);
    expect(looksLikePgDump("")).toBe(false);
    expect(looksLikePgDump('{"json": true}')).toBe(false);
  });
});

describe("inspectDump", () => {
  const info = inspectDump(DUMP);

  it("jadvallar va qatorlarni sanaydi", () => {
    const byName = Object.fromEntries(info.tables.map((t) => [t.table, t.rows]));
    expect(byName.Client).toBe(3);
    expect(byName.User).toBe(2);
    expect(byName.Payment).toBe(1);
    expect(byName.CallLog).toBe(0); // bo'sh jadval ham qayd etiladi
  });

  it("umumiy qatorlar", () => {
    expect(info.totalRows).toBe(6);
  });

  it("pg_dump versiyasini oladi", () => {
    expect(info.pgDumpVersion).toBe("16.3");
  });

  it("asosiy jadvallar joyida — missing bo'sh", () => {
    expect(info.missingCoreTables).toEqual([]);
  });

  it("qatorlar ko'p bo'lgan jadval birinchi turadi", () => {
    expect(info.tables[0].table).toBe("Client");
  });

  it("asosiy jadval yo'q bo'lsa aniqlanadi", () => {
    const partial = DUMP.replace(/COPY public\."Payment"[\s\S]*?\\\.\n/, "");
    expect(inspectDump(partial).missingCoreTables).toContain("Payment");
  });

  it("bitta jadval bir necha COPY blokida kelsa — qo'shiladi", () => {
    const doubled = DUMP + `\nCOPY public."Client" (id) FROM stdin;\nc4\n\\.\n`;
    const byName = Object.fromEntries(inspectDump(doubled).tables.map((t) => [t.table, t.rows]));
    expect(byName.Client).toBe(4);
  });

  it("bo'sh matn — yiqilmaydi", () => {
    const empty = inspectDump("");
    expect(empty.tables).toEqual([]);
    expect(empty.totalRows).toBe(0);
    expect(empty.missingCoreTables.length).toBeGreaterThan(0);
  });
});

describe("openBackupFile", () => {
  const raw = Buffer.from(DUMP, "utf8");

  it("shifrlanmagan .sql ni ochadi", () => {
    const r = openBackupFile(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(inspectDump(r.sql).totalRows).toBe(6);
  });

  it("gzip (.sql.gz) ni ochadi", () => {
    const r = openBackupFile(gzipSync(raw));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sql).toContain("PostgreSQL database dump");
  });

  it("shifrlangan (.enc) ni kalit bilan ochadi", () => {
    const enc = encryptBackup(gzipSync(raw), "maxfiy-backup-kaliti-2026");
    const r = openBackupFile(enc, { encryptionKey: "maxfiy-backup-kaliti-2026" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(inspectDump(r.sql).tables.length).toBe(4);
  });

  it("shifrlangan fayl kalitsiz ochilmaydi", () => {
    const enc = encryptBackup(gzipSync(raw), "maxfiy-backup-kaliti-2026");
    const r = openBackupFile(enc);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("BACKUP_ENCRYPTION_KEY");
  });

  it("noto'g'ri kalit — aniq xato", () => {
    const enc = encryptBackup(gzipSync(raw), "maxfiy-backup-kaliti-2026");
    const r = openBackupFile(enc, { encryptionKey: "boshqa-kalit-1234567" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/kalit noto'g'ri|buzilgan/i);
  });

  it("begona fayl rad etiladi (bazaga qo'llanmaydi)", () => {
    const r = openBackupFile(Buffer.from("men dump emasman", "utf8"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/dump/i);
  });

  it("buzilgan gzip — aniq xato", () => {
    const broken = Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.from("axlat")]);
    const r = openBackupFile(broken);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/gzip/i);
  });
});
