import Link from "next/link";
import { getDb } from "@/db/client";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { requirePermission } from "@/lib/auth";
import { searchCustomers } from "@/modules/customers/customers";

export const metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission("clientes:ver");
  const { q = "" } = await searchParams;
  const rows = await searchCustomers(await getDb(), q.slice(0, 80));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-navy-950">Clientes</h1>
      <form className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Buscar por nome, telefone, placa ou modelo" aria-label="Buscar clientes" maxLength={80} />
        <Button type="submit">Buscar</Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title={q ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"} description={q ? "Tente outro nome, telefone, placa ou modelo." : "Os clientes aparecem aqui a partir do primeiro agendamento ou atendimento."} />
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/clientes/${c.id}`}>
                <Card className="flex items-center justify-between gap-3 p-4 hover:border-navy-950">
                  <div>
                    <p className="font-bold">{c.name}</p>
                    <p className="text-sm text-muted">{c.phone}</p>
                  </div>
                  <span className="text-sm text-muted">{c.vehicleCount} veículo(s)</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
