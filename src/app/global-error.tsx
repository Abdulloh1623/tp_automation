"use client";

// Ildiz (root) darajasidagi kutilmagan xatolar uchun zaxira UI.
// Server tomonidagi xato allaqachon instrumentation orqali Telegram'ga yuboriladi.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="uz">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily: "system-ui, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: "100%",
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: "32px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
            Kutilmagan xatolik yuz berdi
          </h1>
          <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.5, margin: "0 0 20px" }}>
            Sahifani yangilab ko&apos;ring. Muammo davom etsa, administrator bilan
            bog&apos;laning — xato avtomatik qayd etildi.
          </p>
          {error?.digest ? (
            <code
              style={{
                display: "inline-block",
                fontSize: 12,
                color: "#64748b",
                background: "#f1f5f9",
                padding: "4px 8px",
                borderRadius: 6,
                marginBottom: 20,
              }}
            >
              Xato kodi: {error.digest}
            </code>
          ) : null}
          <div>
            <button
              onClick={() => reset()}
              style={{
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                padding: "10px 22px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Qayta urinish
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
