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
          background: "#0e1a16",
          color: "#eef2f0",
          fontFamily: "system-ui, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Kutilmagan xatolik yuz berdi</h1>
          <p style={{ color: "#9bb0a8", lineHeight: 1.5, margin: "0 0 20px" }}>
            Sahifani yangilab ko&apos;ring. Muammo davom etsa, administrator bilan
            bog&apos;laning — xato avtomatik qayd etildi.
          </p>
          {error?.digest ? (
            <code
              style={{
                display: "inline-block",
                fontSize: 12,
                color: "#9bb0a8",
                background: "#13241e",
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
                background: "#e6c772",
                color: "#1a1a1a",
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
