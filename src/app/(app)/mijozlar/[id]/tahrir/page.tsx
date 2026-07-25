import { ClientEditView } from "@/components/client-edit-view";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientEditView id={id} />;
}
