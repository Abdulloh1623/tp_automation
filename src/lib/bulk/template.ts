// Shablon (XLSX) generatsiyasi va yuklangan faylni o'qish.
//
// Shablon ENTITIES ta'rifidan quriladi — ustunlar, namuna qatori va alohida
// "Ko'rsatma" varag'i. Foydalanuvchi shu faylni to'ldirib qaytaradi, dastur
// esa AYNI ta'rif bo'yicha o'qiydi (parse.ts).

import writeXlsxFile from "write-excel-file/node";
import readXlsxFile from "read-excel-file/node";
import type { EntityDef } from "./entities";
import { parseCsv } from "@/lib/csv";

type Cell = {
  value?: string | null;
  fontWeight?: "bold";
  backgroundColor?: string;
  color?: string;
  wrap?: boolean;
  span?: number;
};

const HEADER_BG = "#1E40AF";
const HEADER_FG = "#FFFFFF";
const EXAMPLE_FG = "#94A3B8";

/**
 * Bo'sh (namuna qatori bilan) shablon fayl. Ikki varaq:
 *  1) ma'lumot varag'i — sarlavha + kulrang namuna qator;
 *  2) "Ko'rsatma" — ustun izohlari va umumiy qoidalar.
 */
export async function buildTemplate(def: EntityDef): Promise<Buffer> {
  const header: Cell[] = def.columns.map((c) => ({
    value: c.required ? `${c.label} *` : c.label,
    fontWeight: "bold",
    backgroundColor: HEADER_BG,
    color: HEADER_FG,
  }));

  // Namuna qatori kulrang — foydalanuvchi uni o'chirmasa ham dastur taniydi
  // va o'tkazib yuboradi (parse.isExampleRow).
  const example: Cell[] = def.columns.map((c) => ({
    value: c.example || null,
    color: EXAMPLE_FG,
  }));

  const dataSheet = [header, example];

  // Ko'rsatma varag'i.
  const guide: Cell[][] = [
    [{ value: def.title, fontWeight: "bold" }],
    [{ value: def.description }],
    [],
    [{ value: "UMUMIY QOIDALAR", fontWeight: "bold" }],
    ...def.notes.map((n) => [{ value: `• ${n}`, wrap: true }]),
    [],
    [{ value: "USTUNLAR", fontWeight: "bold" }],
    [
      { value: "Ustun", fontWeight: "bold" },
      { value: "Majburiy", fontWeight: "bold" },
      { value: "Izoh", fontWeight: "bold" },
    ],
    ...def.columns.map((c) => [
      { value: c.label },
      { value: c.required ? "ha" : "yo'q" },
      { value: c.hint ?? "", wrap: true },
    ]),
    [],
    [{ value: "Namuna qatorini o'chirishingiz shart emas — dastur uni o'zi tashlab yuboradi.", wrap: true }],
  ];

  // Ko'p varaqli fayl: har varaq alohida obyekt ({ data, sheet, columns }).
  const sheets = [
    {
      data: dataSheet,
      sheet: def.sheetName,
      columns: def.columns.map((c) => ({
        width: Math.min(34, Math.max(14, c.label.length + 6)),
      })),
    },
    {
      data: guide,
      sheet: "Ko'rsatma",
      columns: [{ width: 30 }, { width: 12 }, { width: 70 }],
    },
  ];

  // Kutubxonaning TS tiplari ko'p varaqli + `buffer` birikmasini qamramaydi
  // (ishlashda muammo yo'q — round-trip testi buni tasdiqlaydi).
  const write = writeXlsxFile as unknown as (
    sheets: unknown,
    opts: { buffer: true },
  ) => Promise<{ toBuffer: () => Promise<Buffer> }>;

  const res = await write(sheets, { buffer: true });
  return res.toBuffer();
}

/**
 * Yuklangan faylni jadvalga (birinchi qator — sarlavha) aylantiradi.
 * XLSX ham, CSV ham qabul qilinadi — foydalanuvchi shablonni CSV qilib
 * saqlab yuborsa ham ishlasin.
 */
export async function readUploadedTable(
  data: Buffer,
  fileName: string,
): Promise<{ ok: true; table: unknown[][] } | { ok: false; error: string }> {
  const isXlsx =
    /\.xlsx$/i.test(fileName) ||
    // XLSX — bu ZIP arxiv: "PK" sehrli baytlari.
    (data.length > 2 && data[0] === 0x50 && data[1] === 0x4b);

  if (isXlsx) {
    try {
      const parsed = (await readXlsxFile(data)) as unknown;
      // Kutubxona versiyasiga qarab [{sheet, data}] yoki to'g'ridan-to'g'ri
      // qatorlar qaytishi mumkin — ikkalasini ham qo'llab-quvvatlaymiz.
      if (Array.isArray(parsed) && parsed.length > 0 && !Array.isArray(parsed[0])) {
        const first = parsed[0] as { data?: unknown[][] };
        return { ok: true, table: first.data ?? [] };
      }
      return { ok: true, table: (parsed as unknown[][]) ?? [] };
    } catch (e) {
      return {
        ok: false,
        error: `Excel fayl o'qilmadi: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // CSV
  try {
    const text = data.toString("utf8").replace(/^﻿/, "");
    return { ok: true, table: parseCsv(text) };
  } catch {
    return { ok: false, error: "Fayl o'qilmadi — .xlsx yoki .csv yuklang" };
  }
}
