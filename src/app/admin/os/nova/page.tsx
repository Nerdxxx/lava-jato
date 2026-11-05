import { getDb } from "@/db/client";
import { Flash } from "@/components/layout/flash";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requirePermission } from "@/lib/auth";
import { formatBRL } from "@/lib/utils";
import { getCatalog } from "@/modules/scheduling/catalog";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/modules/scheduling/labels";
import { createWalkInAction } from "../actions";

export const metadata = { title: "Novo atendimento" };
export const dynamic = "force-dynamic";

export default async function NewWorkOrderPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  await requirePermission("os:gerir");
  const { erro } = await searchParams;
  const catalog = await getCatalog(await getDb());

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-extrabold text-navy-950">Novo atendimento</h1>
      <p className="text-sm text-muted">Para clientes que chegaram sem agendamento. O preço é o da tabela vigente.</p>
      <Flash erro={erro} />
      <Card>
        <form action={createWalkInAction} className="space-y-4">
          <Field label="Nome do cliente" htmlFor="name">
            <Input id="name" name="name" required maxLength={120} />
          </Field>
          <Field label="WhatsApp (com DDD)" htmlFor="phone">
            <Input id="phone" name="phone" required inputMode="tel" placeholder="(79) 99999-9999" />
          </Field>
          <Field label="Tipo de veículo" htmlFor="category">
            <select id="category" name="category" required className="min-h-11 w-full rounded-lg border border-line bg-surface px-3">
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Serviço" htmlFor="serviceId">
            <select id="serviceId" name="serviceId" required className="min-h-11 w-full rounded-lg border border-line bg-surface px-3">
              {catalog.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({Object.entries(s.prices).map(([c, p]) => `${CATEGORY_LABEL[c]}: ${formatBRL(p ?? 0)}`).join(" · ")})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Modelo do veículo" htmlFor="vehicleModel">
            <Input id="vehicleModel" name="vehicleModel" required maxLength={80} />
          </Field>
          <Field label="Placa (opcional)" htmlFor="plate">
            <Input id="plate" name="plate" maxLength={10} autoCapitalize="characters" />
          </Field>
          <Field label="Observações (opcional)" htmlFor="notes">
            <Input id="notes" name="notes" maxLength={500} />
          </Field>
          <Button type="submit">Criar OS</Button>
        </form>
      </Card>
    </div>
  );
}
