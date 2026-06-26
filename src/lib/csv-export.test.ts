import { describe, it, expect } from "vitest";
import { buildCsv } from "./csv-export";

const cols = [{ key: "v", label: "Qiymat" }];
const cell = (v: unknown) => buildCsv(cols, [{ v }]).split("\r\n")[1];

describe("buildCsv — formula injection himoyasi", () => {
  it("=, +, -, @ bilan boshlanadigan katakka ' qo'shadi", () => {
    expect(cell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(cell("+998901112233")).toBe("'+998901112233");
    expect(cell("-1+1")).toBe("'-1+1");
    expect(cell("@HYPERLINK")).toBe("'@HYPERLINK");
  });

  it("xavfsiz matnga tegmaydi", () => {
    expect(cell("Kafe Shirin")).toBe("Kafe Shirin");
    expect(cell("998901112233")).toBe("998901112233");
  });
});

describe("buildCsv — qo'shtirnoq/vergul", () => {
  it("vergulli qiymatni qo'shtirnoqqa oladi", () => {
    expect(cell("Kafe, Shirin")).toBe('"Kafe, Shirin"');
  });

  it("ichki qo'shtirnoqni ikkilaydi", () => {
    expect(cell('a"b')).toBe('"a""b"');
  });

  it("sarlavha qatori birinchi", () => {
    const csv = buildCsv(cols, []);
    expect(csv.split("\r\n")[0]).toBe("Qiymat");
  });
});
