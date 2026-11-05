import Link from "next/link";
import { getDb } from "@/db/client";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { Flash } from "@/components/layout/flash";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { formatTimeBR } from "@/lib/time";
import { getBoard } from "@/modules/operations/queries";
import {
  formatOsNumber,
  maskPlate,
  nextStatuses,
  WORK_ORDER_STATUS_LABEL,
  type WorkOrderStatus,
} from "@/modules/operations/state-machine";
import { CATEGORY_LABEL } from "@/modules/scheduling/labels";
import { checkInAction, changeStatusAction } from "../os/actions";

export const metadata = { title: "Fila operacional" };
export const dynamic = "force-dynamic";

const COLUMNS: { key: string; title: string; statuses: WorkOrderStatus[] }[] = [
  { key: "recebidos", title: "Recebidos", statuses: ["AGUARDANDO_RECEPCAO", "RECEBIDO"] },
  { key: "aguardando", title: "Aguardando", statuses: ["NA_FILA"] },
  { key: "lavagem", title: "Em lavagem", statuses: ["EM_LAVAGEM"] },
  { key: "finalizacao", title: "Finalização", statuses: ["EM_FINALIZACAO", "AGUARDANDO_INSPECAO"] },
  { key: "prontos", title: "Prontos", statuses: ["PRONTO_PARA_ENTREGA"] },
  { key: "entregues", title: "Entregues hoje", statuses: ["ENTREGUE"] },
];

const ACTION_LABEL: Partial<Record<WorkOrderStatus, string>> = {
  NA_FILA: "Colocar na fila",
  EM_LAVAGEM: "Iniciar lavagem",
  EM_FINALIZACAO: "Finalizar lavagem",
  AGUARDANDO_INSPECAO: "Enviar p/ inspeção",
  PRONTO_PARA_ENTREGA: "Marcar pronto",
  ENTREGUE: "Entregar",
};

function elapsed(from: Date, now: Date): string {
  const min = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requirePermission("fila:ver");
  const { ok, erro } = await searchParams;
  const canSeeCustomer = hasPermission(user.role, "clientes:ver");
  const canUpdate = hasPermission(user.role, "fila:atualizar");
  const canCheckIn = hasPermission(user.role, "os:gerir");
  const db = await getDb();
  const { orders, scheduled, now } = await getBoard(db, user);

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={10} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-navy-950">Fila operacional</h1>
        {canCheckIn && (
          <Link href="/admin/os/nova" className="inline-flex min-h-11 items-center rounded-lg bg-sun-400 px-5 text-sm font-semibold text-navy-950">
            Novo atendimento
          </Link>
        )}
      </div>
      <Flash ok={ok} erro={erro} />
      <p className="text-xs text-muted">Atualiza sozinha a cada 10 segundos.</p>

      <div className="flex gap-3 overflow-x-auto pb-3">
        <Column title="Agendados hoje" count={scheduled.length}>
          {scheduled.map(({ a, customerName }) => (
            <Card key={a.id} className="space-y-2 p-3">
              <p className="font-bold">
                {formatTimeBR(a.startsAt)} · {a.vehicleModel}
              </p>
              <p className="text-xs text-muted">
                {maskPlate(a.vehiclePlate)} · {CATEGORY_LABEL[a.category]}
                {canSeeCustomer ? ` · ${customerName}` : ""}
              </p>
              <Badge tone={a.status === "CONFIRMADO" ? "info" : "warning"}>{a.status === "CONFIRMADO" ? "Confirmado" : "Aguardando confirmação"}</Badge>
              {canCheckIn && a.status === "CONFIRMADO" && (
                <form action={checkInAction}>
                  <input type="hidden" name="appointmentId" value={a.id} />
                  <Button type="submit" className="min-h-10 w-full px-3">
                    Fazer check-in
                  </Button>
                </form>
              )}
            </Card>
          ))}
        </Column>

        {COLUMNS.map((col) => {
          const items = orders.filter((o) => col.statuses.includes(o.wo.status));
          return (
            <Column key={col.key} title={col.title} count={items.length}>
              {items.map(({ wo, customerName, assigneeName }) => (
                <Card key={wo.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/os/${wo.id}`} className="font-bold underline-offset-2 hover:underline">
                      {wo.vehicleModel}
                    </Link>
                    <span className="text-xs text-muted">{formatOsNumber(wo.number)}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {maskPlate(wo.vehiclePlate)} · {wo.serviceName}
                    {canSeeCustomer ? ` · ${customerName}` : ""}
                  </p>
                  <p className="text-xs">
                    {wo.status === "ENTREGUE" ? "Entregue" : `Há ${elapsed(wo.receivedAt, now)}`} · {assigneeName ?? "sem responsável"}
                  </p>
                  {col.statuses.length > 1 || wo.status === "AGUARDANDO_INSPECAO" ? <Badge tone="info">{WORK_ORDER_STATUS_LABEL[wo.status]}</Badge> : null}
                  {canUpdate && (
                    <div className="flex flex-wrap gap-2">
                      {nextStatuses(wo.status)
                        .filter((s) => ACTION_LABEL[s])
                        .slice(0, 2)
                        .map((s) => (
                          <form key={s} action={changeStatusAction}>
                            <input type="hidden" name="workOrderId" value={wo.id} />
                            <input type="hidden" name="to" value={s} />
                            <Button type="submit" variant={s === "ENTREGUE" || s === "EM_LAVAGEM" ? "primary" : "outline"} className="min-h-10 px-3">
                              {ACTION_LABEL[s]}
                            </Button>
                          </form>
                        ))}
                    </div>
                  )}
                </Card>
              ))}
            </Column>
          );
        })}
      </div>
    </div>
  );
}

function Column({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="w-72 shrink-0 space-y-2" aria-label={title}>
      <h2 className="flex items-center justify-between rounded-lg bg-navy-950 px-3 py-2 text-sm font-bold text-white">
        {title} <span className="rounded-full bg-white/20 px-2 text-xs">{count}</span>
      </h2>
      {count === 0 ? <p className="rounded-lg border border-dashed border-line p-3 text-center text-xs text-muted">Vazio</p> : children}
    </section>
  );
}
