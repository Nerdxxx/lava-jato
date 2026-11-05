import { LookupClient } from "./lookup";

export const metadata = { title: "Consultar agendamento" };

export default function LookupPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-extrabold text-navy-950">Consultar agendamento</h1>
      <p className="text-sm text-muted">Informe o código recebido e o WhatsApp usado no agendamento.</p>
      <LookupClient />
    </div>
  );
}
