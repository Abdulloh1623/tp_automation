import { ClientProfile } from "@/components/client-profile";

// To'liq profil tanasi @/components/client-profile da (bu sahifa VA intercepting
// route modali — @modal/(.)mijozlar/[id] — ikkalasi shu yagona komponentni ishlatadi).
export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientProfile id={id} />;
}
