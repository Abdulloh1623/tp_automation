// Intercepting route: ilova ichida /mijozlar/[id] ga SOFT o'tilganda (masalan
// tez-ko'rish modalidagi "To'liq profil") — profil sahifasi to'liq holda katta
// blur-modal ichida ochiladi (sahifadan chiqmasdan). To'g'ridan-to'g'ri yuklanganda
// (refresh / yangi tab / havola) esa oddiy sahifa ochiladi — bir xil komponent.
import { ClientProfile } from "@/components/client-profile";
import { ProfileModalShell } from "@/components/profile-modal-shell";

export default async function InterceptedClientProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ProfileModalShell>
      <ClientProfile id={id} />
    </ProfileModalShell>
  );
}
