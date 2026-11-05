import Link from "next/link";
import { getDb } from "@/db/client";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { formatDateTimeBR } from "@/lib/time";
import { formatBRL } from "@/lib/utils";
import { listWorkOrders } from "@/modules/operations/queries";
import {
  formatOsNumber,
  maskPlate,
  WORK_ORDER_STATUSES,
  WORK_ORDER_STATUS_LABEL,
  type WorkOrderStatus,
} from "@/modules/operations/state-machine";

export const metadata = { title: "Ordens de serviço" };
export const dynamic = "force-dynamic";

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePermission("os:ver");
  const { status } = await searchParams;
  const filter = (WORK_ORDER_STATUSES as readonly string[]).includes(status ?? "") ? (status as WorkOrderStatus) : undefined;
  const rows = await listWorkOrders(await getDb(), user, filter);
  const canSeeCustomer = hasPermission(user.role, "clientes:ver");
  const canSeeMoney = hasPermission(user.role, "financeiro:ver");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-navy-950">Ordens de serviço</h1>
        <form className="flex items-center gap-2">
          <select name="status" defaultValue={filter ?? ""} aria-label="Filtrar por status" className="min-h-10 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value="">Todos os status</option>
            {WORK_ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {WORK_ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button type="submit" className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm font-semibold">
            Filtrar
          </button>
        </form>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nenhuma ordem de serviço encontrada" />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ wo, customerName }) => (
            <li key={wo.id}>
              <Link href={`/admin/os/${wo.id}`}>
                <Card className="flex flex-wrap items-center justify-between gap-2 p-4 hover:border-navy-950">
                  <div>
                    <p className="font-bold">
                      {formatOsNumber(wo.number)} · {wo.vehicleModel} <span className="font-normal text-muted">({maskPlate(wo.vehiclePlate)})</span>
                    </p>
                    <p className="text-sm text-muted">
                      {wo.serviceName}
                      {canSeeCustomer ? ` · ${customerName}` : ""} · {formatDateTimeBR(wo.createdAt)}
                      {canSeeMoney ? ` · ${formatBRL(wo.priceCents - wo.discountCents)}` : ""}
                    </p>
                  </div>
                  <Badge tone={wo.status === "CANCELADO" ? "danger" : wo.status === "ENTREGUE" ? "success" : "info"}>{WORK_ORDER_STATUS_LABEL[wo.status]}</Badge>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
