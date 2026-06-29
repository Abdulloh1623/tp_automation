import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "POS CRM — TP Automation",
  description: "Restoran mijozlari, obuna va to'lovlarni boshqarish platformasi",
};

// FOUC oldini olish: React gidratsiyasidan oldin .dark klassi qo'yiladi.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
