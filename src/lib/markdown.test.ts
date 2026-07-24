import { describe, it, expect } from "vitest";
import { safeLinkUrl, safeImageUrl, stripMarkdown } from "./markdown-utils";

describe("safeLinkUrl", () => {
  it("http/https va ichki yo'lni qabul qiladi", () => {
    expect(safeLinkUrl("https://example.com")).toBe("https://example.com");
    expect(safeLinkUrl("http://a.uz/x")).toBe("http://a.uz/x");
    expect(safeLinkUrl("/mijozlar/123")).toBe("/mijozlar/123");
  });
  it("xavfli/noto'g'ri sxemalarni rad etadi", () => {
    expect(safeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(safeLinkUrl("data:text/html,<script>")).toBeNull();
    expect(safeLinkUrl("//evil.com")).toBeNull();
    expect(safeLinkUrl("ftp://x")).toBeNull();
    expect(safeLinkUrl("")).toBeNull();
  });
});

describe("safeImageUrl", () => {
  it("ichki yo'l va data:image ni qabul qiladi", () => {
    expect(safeImageUrl("/api/faq-image/abc.png")).toBe("/api/faq-image/abc.png");
    expect(safeImageUrl("data:image/png;base64,iVBOR")).toBe(
      "data:image/png;base64,iVBOR",
    );
  });
  it("tashqi http(s) rasmni rad etadi (CSP bloklaydi)", () => {
    expect(safeImageUrl("https://cdn.example.com/a.png")).toBeNull();
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageUrl("data:text/html;base64,x")).toBeNull();
  });
});

describe("stripMarkdown", () => {
  it("markdown belgilarini olib tashlaydi", () => {
    expect(stripMarkdown("**Qalin** va *kursiv* matn")).toBe(
      "Qalin va kursiv matn",
    );
  });
  it("havolani matnga aylantiradi, rasmni olib tashlaydi", () => {
    expect(stripMarkdown("Batafsil [bu yerda](https://x.uz)")).toBe(
      "Batafsil bu yerda",
    );
    expect(stripMarkdown("Skrin: ![alt](/api/faq-image/a.png) tayyor")).toBe(
      "Skrin: tayyor",
    );
  });
  it("bo'sh/null → bo'sh satr", () => {
    expect(stripMarkdown(null)).toBe("");
    expect(stripMarkdown("")).toBe("");
  });
});
