// Intercepting route: modal ochiq turганда "Tahrirlash" bosilsa
// (/mijozlar/[id]/tahrir ga SOFT o'tish) — tahrirlash formasi HAM shu blur-modal
// ichida ochiladi (sahifadan chiqmasdan). To'g'ridan-to'g'ri yuklanganda (refresh
// / yangi tab / havola) esa oddiy sahifa ochiladi — bir xil komponent.
//
// Bu bo'lmasa @modal sloti soft-navigatsiyada oldingi holatini (profil modalini)
// saqlab qolardi va tahrirlash sahifasi orqada ko'rinmay qolardi — ya'ni tugma
// "ishlamayotgandek" bo'lardi.
import { ClientEditView } from "@/components/client-edit-view";
import { ProfileModalShell } from "@/components/profile-modal-shell";

export default async function InterceptedClientEdit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ProfileModalShell>
      <ClientEditView id={id} inline />
    </ProfileModalShell>
  );
}
