import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { servicePrices, services } from "@/db/schema";
import { Card, EmptyState } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";

export const metadata = { title: "Preços" };
export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  MOTO: "Moto",
  CARRO_PEQUENO: "Carro pequeno",
  CARRO_MEDIO: "Carro médio",
  SUV: "SUV / Utilitário",
  PICAPE: "Picape",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL);

export default async function PricesPage() {
  const db = await getDb();
  const svcs = await db.select().from(services).where(eq(services.active, true)).orderBy(asc(services.displayOrder));
  const prices = await db.select().from(servicePrices).where(eq(servicePrices.active, true));

  if (svcs.length === 0) {
    return <EmptyState title="Tabela de preços ainda não cadastrada" description="Cadastre os serviços no painel administrativo." />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-navy-950">Tabela de preços</h1>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="bg-navy-950 text-white">
            <tr>
              <th className="p-3">Veículo</th>
              {svcs.map((s) => (
                <th key={s.id} className="p-3">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.map((cat) => (
              <tr key={cat} className="border-t border-line">
                <th className="p-3 font-semibold">{CATEGORY_LABEL[cat]}</th>
                {svcs.map((s) => {
                  const p = prices.find((x) => x.serviceId === s.id && x.category === cat);
                  return (
                    <td key={s.id} className="p-3 font-semibold">
                      {p ? formatBRL(p.priceCents) : <span className="font-normal text-muted">Indisponível</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-sm text-muted">A lavagem completa inclui limpeza interna básica. Não inclui higienização profunda.</p>
    </div>
  );
}
