import Link from "next/link";
import { getDb } from "@/db/client";
import { BookingWizard } from "@/app/(public)/agendar/wizard";
import { EmptyState } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth";
import { addDays, localDateOf } from "@/lib/time";
import { loadAddons } from "@/modules/scheduling/addons";
import { getCatalog } from "@/modules/scheduling/catalog";
import { loadSettings } from "@/modules/scheduling/settings";
import { createCounterBookingAction } from "../actions";

export const metadata = { title: "Novo agendamento" };
export const dynamic = "force-dynamic";

export default async function CounterBookingPage() {
  await requirePermission("agenda:gerir");
  const db = await getDb();
  const [catalog, settings, addons] = await Promise.all([getCatalog(db), loadSettings(db), loadAddons(db)]);
  const today = localDateOf(new Date());
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-navy-950">Novo agendamento</h1>
        <Link href="/admin/agenda" className="text-sm underline">
          Voltar à agenda
        </Link>
      </div>
      {catalog.length === 0 ? (
        <EmptyState title="Nenhum serviço ativo" description="Cadastre preços em Configurações." />
      ) : (
        <BookingWizard catalog={catalog} addons={addons.filter((a) => a.active)} minDate={today} maxDate={addDays(today, settings.maxAdvanceDays)} prepMinutes={settings.prepMinutes} action={createCounterBookingAction} staff />
      )}
    </div>
  );
}
