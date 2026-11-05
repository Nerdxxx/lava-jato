import { getDb } from "@/db/client";
import { EmptyState } from "@/components/ui/card";
import { addDays, localDateOf } from "@/lib/time";
import { getCatalog } from "@/modules/scheduling/catalog";
import { loadSettings } from "@/modules/scheduling/settings";
import { BookingWizard } from "./wizard";

export const metadata = { title: "Agendar lavagem" };
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const db = await getDb();
  const [catalog, settings] = await Promise.all([getCatalog(db), loadSettings(db)]);
  const today = localDateOf(new Date());

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-extrabold text-navy-950">Agendar lavagem</h1>
      {catalog.length === 0 ? (
        <EmptyState title="Agendamento indisponível no momento" description="Os serviços ainda não foram cadastrados." />
      ) : (
        <BookingWizard catalog={catalog} minDate={today} maxDate={addDays(today, settings.maxAdvanceDays)} />
      )}
    </div>
  );
}
