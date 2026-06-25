// Minimal CSV parser — tashqi kutubxonasiz.
// Qo'shtirnoqli maydonlar, ichidagi vergul/yangi qator va "" escape'ni qo'llaydi.
// Ajratuvchi (vergul / nuqta-vergul / tab) avtomatik aniqlanadi.

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ",";
}

type RawRow = { cells: string[]; line: number };

function parseCsvRaw(input: string, delimiter?: string): RawRow[] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const delim = delimiter ?? detectDelimiter(text);

  const rows: RawRow[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  let line = 1;
  let recordStart = 1; // joriy yozuv boshlangan fizik satr

  const pushRow = () => {
    row.push(field);
    rows.push({ cells: row, line: recordStart });
    row = [];
    field = "";
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      if (ch === "\n") line += 1; // qo'shtirnoq ichidagi yangi qator
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delim) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      line += 1;
      recordStart = line;
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  // To'liq bo'sh qatorlarni olib tashlash (satr raqamini saqlagan holda)
  return rows.filter((r) => r.cells.some((c) => c.trim() !== ""));
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  return parseCsvRaw(input, delimiter).map((r) => r.cells);
}

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  /** Har bir data qatorining CSV fayldagi fizik satr raqami (1-asosli). */
  lines: number[];
};

/** Birinchi qatorni sarlavha sifatida ajratib beradi. */
export function parseCsvWithHeader(input: string): ParsedCsv {
  const all = parseCsvRaw(input);
  if (all.length === 0) return { headers: [], rows: [], lines: [] };
  const [header, ...data] = all;
  return {
    headers: header.cells.map((h) => h.trim()),
    rows: data.map((r) => r.cells),
    lines: data.map((r) => r.line),
  };
}
