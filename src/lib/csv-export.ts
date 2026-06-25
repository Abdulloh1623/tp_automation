// CSV (Excel) eksport — toza buildCsv (server+klient) va downloadCsv (klient).

export type CsvColumn = { key: string; label: string };

export function buildCsv(
  columns: CsvColumn[],
  rows: Record<string, unknown>[],
): string {
  const esc = (v: unknown) => {
    let s = v == null ? "" : String(v);
    // Formula injection himoyasi: =, +, -, @, Tab yoki CR bilan boshlanadigan
    // katak Excel/Sheets'da formula bo'lib bajarilmasligi uchun ' qo'shamiz.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = columns.map((c) => esc(c.label)).join(",");
  const lines = rows.map((r) => columns.map((c) => esc(r[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}

/** Klient: CSV faylni yuklab olish (Excel UTF-8 uchun BOM bilan). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
