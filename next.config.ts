import type { NextConfig } from "next";

// DIQQAT: Content-Security-Policy bu yerda EMAS — u `middleware.ts` da,
// har so'rovga yangi nonce bilan quriladi (lib/csp.ts). Bu yerga ham qo'shilsa
// brauzer IKKALA siyosatni ham qo'llaydi (kesishma) va nonce ishlamay qoladi.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  typescript: {
    // MVP bosqichida buildni to'xtatmaslik uchun; keyin yoqiladi.
    ignoreBuildErrors: false,
  },
  // Native/runtime modullar server bundle'ga kirmasin (resvg = native binar;
  // pino = runtime'da require qilinsin, aks holda bundling dinamik require'larni buzadi).
  serverExternalPackages: ["@resvg/resvg-js", "pino"],
  experimental: {
    // Fayl yuklaydigan HAR BIR forma server action orqali ketadi (chek rasmi,
    // soliq hujjati, topshirish skani, FAQ skrinshoti, ommaviy XLSX, backup).
    // Next'ning sukutdagi chegarasi 1MB — telefonda olingan oddiy chek surati
    // ham undan katta bo'lgani uchun so'rov modul ichidagi hajm tekshiruviga
    // YETIB BORMASDAN "Body exceeded 1 MB limit" bilan yiqilardi (prod xatosi,
    // 31/07/2026). Bu qiymat modullardagi eng katta chegaradan (bulk.ts —
    // 20MB) past bo'lmasligi kerak, aks holda o'sha tekshiruvlar aldamchi
    // bo'lib qoladi. Yangi chegara qo'shsangiz shu raqamni ham qarang.
    serverActions: { bodySizeLimit: "25mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
