import { PageShell } from "@/components/site/section";
import { LookupClient } from "./lookup";

export const metadata = { title: "Consultar agendamento" };
// O layout público lê horários e contato do banco: nada de página congelada no build.
export const dynamic = "force-dynamic";

export default function LookupPage() {
  return (
    <PageShell narrow eyebrow="Meu agendamento" title="Consultar agendamento" description="Informe o código recebido e o WhatsApp usado no agendamento para ver, reagendar ou cancelar.">
      <LookupClient />
    </PageShell>
  );
}
