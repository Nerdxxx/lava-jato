import { getDb } from "@/db/client";
import { EmptyState } from "@/components/ui/card";
import { PageShell } from "@/components/site/section";
import { addDays, localDateOf } from "@/lib/time";
import { loadAddons } from "@/modules/scheduling/addons";
import { getCatalog } from "@/modules/scheduling/catalog";
import { loadSettings } from "@/modules/scheduling/settings";
import { BookingWizard } from "./wizard";

export const metadata = {
  title: "Agendar lavagem",
  description: "Escolha o veículo, o serviço e um horário livre. Agendamento online do Lava Jato Capuã.",
};
export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ categoria?: string; servico?: string }> }) {
  const { categoria, servico } = await searchParams;
  const db = await getDb();
  const [catalog, settings, addons] = await Promise.all([getCatalog(db), loadSettings(db), loadAddons(db)]);
  const today = localDateOf(new Date());

  return (
    <PageShell eyebrow="Agendamento online" title="Agendar lavagem" description="Leva menos de um minuto. Você escolhe um horário realmente livre e paga no local.">
      {catalog.length === 0 ? (
        <EmptyState title="Agendamento indisponível no momento" description="Os serviços ainda não foram cadastrados." />
      ) : (
        <BookingWizard
          catalog={catalog}
          addons={addons.filter((a) => a.active)}
          minDate={today}
          maxDate={addDays(today, settings.maxAdvanceDays)}
          prepMinutes={settings.prepMinutes}
          initialCategory={typeof categoria === "string" ? categoria : undefined}
          initialServiceId={typeof servico === "string" ? servico : undefined}
        />
      )}
    </PageShell>
  );
}
