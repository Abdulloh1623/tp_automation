import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "POS CRM — TP Automation",
  description: "Restoran mijozlari, obuna va to'lovlarni boshqarish platformasi",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}
