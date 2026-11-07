import Link from "next/link";
import { getDb } from "@/db/client";
import { EmptyState } from "@/components/ui/card";
import { PriceTable } from "@/components/site/price-table";
import { PageShell } from "@/components/site/section";
import { loadAddons } from "@/modules/scheduling/addons";
import { getCatalog } from "@/modules/scheduling/catalog";

export const metadata = {
  title: "Tabela de preços",
  description: "Preços da lavagem externa, lavagem completa e lavagem de motos no Lava Jato Capuã, em Barra dos Coqueiros — SE.",
};
export const dynamic = "force-dynamic";

export default async function PricesPage() {
  const db = await getDb();
  const [catalog, addons] = await Promise.all([getCatalog(db), loadAddons(db)]);
  const active = addons.filter((a) => a.active && a.categories.length > 0);

  return (
    <PageShell eyebrow="Preços" title="Tabela de preços" description="Valores por tipo de veículo, pagos no local no dia do atendimento.">
      {catalog.length === 0 ? (
        <EmptyState title="Tabela de preços ainda não cadastrada" description="Os serviços aparecerão aqui assim que forem cadastrados." />
      ) : (
        <div className="space-y-6">
          <PriceTable catalog={catalog} addons={active} />
          {catalog.some((s) => s.excludes.length > 0) && (
            <ul className="space-y-1 text-sm text-muted">
              {catalog
                .filter((s) => s.excludes.length > 0)
                .map((s) => (
                  <li key={s.id}>
                    {s.name}: não inclui {s.excludes.join(", ").toLowerCase()}.
                  </li>
                ))}
            </ul>
          )}
          <Link
            href="/agendar"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-sun-400 px-6 text-sm font-bold text-navy-950 hover:bg-sun-500"
          >
            Agendar minha lavagem
          </Link>
        </div>
      )}
    </PageShell>
  );
}
