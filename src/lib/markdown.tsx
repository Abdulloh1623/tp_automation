// Cheklangan, XSS-xavfsiz markdown renderi (FAQ matnlari uchun).
//
// dangerouslySetInnerHTML ISHLATILMAYDI — hamma narsa React elementlariga
// aylantiriladi, shuning uchun in'ektsiya imkonsiz. Qo'llab-quvvatlanadi:
//   **qalin**            → <strong>
//   *kursiv* / _kursiv_  → <em>
//   [matn](https://…)    → <a> (faqat http/https yoki ichki `/…` havola)
//   ![alt](/api/…)       → <img> (faqat ichki yuklangan rasm yoki data:;
//                          tashqi http(s) rasm CSP bilan bloklanadi — havolaga
//                          aylantiriladi)
//   - band / * band      → <ul><li>
//   bo'sh qator          → yangi paragraf; bitta qator uzilishi → <br>
import React from "react";
import { cn } from "@/lib/utils";
import { safeLinkUrl, safeImageUrl } from "@/lib/markdown-utils";

export { stripMarkdown } from "@/lib/markdown-utils";

const LINK_CLS =
  "text-primary-600 dark:text-primary-400 underline underline-offset-2 hover:text-primary-700 dark:hover:text-primary-300 break-words";
const IMG_CLS =
  "my-2 block max-h-96 max-w-full rounded-lg border border-slate-200 dark:border-slate-800";

/** Bitta matn qatorini inline markdown bo'yicha React tugunlariga aylantiradi. */
function renderInline(text: string, key: () => string): React.ReactNode[] {
  const patterns: {
    re: RegExp;
    make: (m: RegExpMatchArray) => React.ReactNode;
  }[] = [
    {
      // ![alt](url) — rasm (link'dan OLDIN sinaladi)
      re: /^!\[([^\]]*)\]\(([^)\s]+)\)/,
      make: (m) => {
        const img = safeImageUrl(m[2]);
        if (img)
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={key()} src={img} alt={m[1] || "rasm"} className={IMG_CLS} />;
        const link = safeLinkUrl(m[2]);
        if (link)
          return (
            <a key={key()} href={link} target="_blank" rel="noopener noreferrer nofollow" className={LINK_CLS}>
              {m[1] || link}
            </a>
          );
        return m[0];
      },
    },
    {
      // [matn](url) — havola
      re: /^\[([^\]]+)\]\(([^)\s]+)\)/,
      make: (m) => {
        const link = safeLinkUrl(m[2]);
        if (link)
          return (
            <a key={key()} href={link} target="_blank" rel="noopener noreferrer nofollow" className={LINK_CLS}>
              {renderInline(m[1], key)}
            </a>
          );
        return <React.Fragment key={key()}>{renderInline(m[1], key)}</React.Fragment>;
      },
    },
    {
      re: /^\*\*([\s\S]+?)\*\*/,
      make: (m) => <strong key={key()}>{renderInline(m[1], key)}</strong>,
    },
    {
      re: /^\*([^*\n]+)\*/,
      make: (m) => <em key={key()}>{renderInline(m[1], key)}</em>,
    },
    {
      re: /^_([^_\n]+)_/,
      make: (m) => <em key={key()}>{renderInline(m[1], key)}</em>,
    },
  ];

  const nodes: React.ReactNode[] = [];
  let rest = text;
  let buf = "";
  while (rest.length > 0) {
    let matched = false;
    for (const p of patterns) {
      const m = rest.match(p.re);
      if (m) {
        if (buf) {
          nodes.push(buf);
          buf = "";
        }
        nodes.push(p.make(m));
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      buf += rest[0];
      rest = rest.slice(1);
    }
  }
  if (buf) nodes.push(buf);
  return nodes;
}

/** FAQ matnini xavfsiz render qiladi. Server komponentida ham ishlaydi. */
export function MarkdownView({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  const src = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!src) return null;
  let counter = 0;
  const key = () => `md${counter++}`;
  const blocks = src.split(/\n{2,}/);
  return (
    <div className={cn("space-y-2 leading-relaxed break-words", className)}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList =
          lines.length > 0 && lines.every((l) => /^\s*[-*]\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.replace(/^\s*[-*]\s+/, ""), key)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(l, key)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
