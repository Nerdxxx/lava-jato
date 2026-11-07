import { and, asc, eq, gte, lt } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db/client";
import { appointments, customers, resources, services } from "@/db/schema";
import { Flash } from "@/components/layout/flash";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { addDays, formatTimeBR, isValidDateStr, localDateOf, localToUtc } from "@/lib/time";
import { formatBRL } from "@/lib/utils";
import { CATEGORY_LABEL, STATUS_LABEL, STATUS_TONE } from "@/modules/scheduling/labels";
import { canTransition, type AppointmentStatus } from "@/modules/scheduling/state-machine";
import { checkInAction } from "../os/actions";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { changeStatusAction } from "./actions";

export const metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

const ACTIONS: { to: AppointmentStatus; label: string; variant: "primary" | "outline" | "danger" }[] = [
  { to: "CONFIRMADO", label: "Confirmar", variant: "primary" },
  { to: "NAO_COMPARECEU", label: "Não compareceu", variant: "outline" },
  { to: "CANCELADO", label: "Cancelar", variant: "danger" },
];

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ data?: string; ok?: string; erro?: string }> }) {
  const user = await requirePermission("agenda:ver");
  const canManage = hasPermission(user.role, "agenda:gerir");
  const { data, ok, erro } = await searchParams;
  const date = data && isValidDateStr(data) ? data : localDateOf(new Date());

  const db = await getDb();
  const rows = await db
    .select({
      a: appointments,
      customerName: customers.name,
      customerPhone: customers.phone,
      serviceName: services.name,
      resourceName: resources.name,
    })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(resources, eq(resources.id, appointments.resourceId))
    .where(and(gte(appointments.startsAt, localToUtc(date, "00:00")), lt(appointments.startsAt, localToUtc(addDays(date, 1), "00:00"))))
    .orderBy(asc(appointments.startsAt));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-navy-950">Agenda</h1>
          {canManage && (
            <Link href="/admin/agenda/novo" className="rounded-lg bg-sun-400 px-3 py-2 text-sm font-semibold text-navy-950 hover:bg-sun-500">
              + Novo agendamento
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link href={`/admin/agenda?data=${addDays(date, -1)}`} className="rounded-lg border border-line bg-surface px-3 py-2">
            ← Anterior
          </Link>
          <form className="flex items-center gap-2">
            <input
              type="date"
              name="data"
              defaultValue={date}
              aria-label="Data"
              className="min-h-10 rounded-lg border border-line bg-surface px-2"
            />
            <Button type="submit" variant="outline" className="min-h-10 px-3">
              Ir
            </Button>
          </form>
          <Link href={`/admin/agenda?data=${addDays(date, 1)}`} className="rounded-lg border border-line bg-surface px-3 py-2">
            Próximo →
          </Link>
        </div>
      </div>

      <Flash ok={ok} erro={erro} />
      {rows.length === 0 ? (
        <EmptyState title="Nenhum agendamento nesta data" />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ a, customerName, customerPhone, serviceName, resourceName }) => (
            <li key={a.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-extrabold">
                    {formatTimeBR(a.startsAt)}–{formatTimeBR(a.endsAt)}
                  </p>
                  <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                </div>
                <p className="text-sm">
                  <span className="font-semibold">{serviceName}</span>
                  {a.addons.length > 0 && <span className="text-muted"> + {a.addons.map((x) => x.name).join(", ")}</span>} · {CATEGORY_LABEL[a.category]} — {a.vehicleModel}
                  {a.vehiclePlate ? ` (${a.vehiclePlate})` : ""} · {formatBRL(a.priceCents)}
                </p>
                <p className="text-sm text-muted">
                  {customerName} ·{" "}
                  <a className="underline" href={`https://wa.me/55${customerPhone}`} target="_blank" rel="noopener noreferrer">
                    {customerPhone}
                  </a>{" "}
                  · {resourceName} · código {a.code}
                </p>
                {a.notes && <p className="text-sm">Obs.: {a.notes}</p>}
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    {a.status === "CONFIRMADO" && hasPermission(user.role, "os:gerir") && (
                      <form action={checkInAction}>
                        <input type="hidden" name="appointmentId" value={a.id} />
                        <Button type="submit" className="min-h-10 px-3">
                          Fazer check-in
                        </Button>
                      </form>
                    )}
                    {ACTIONS.filter((x) => canTransition(a.status, x.to)).map((x) => (
                      <form key={x.to} action={changeStatusAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="to" value={x.to} />
                        <Button type="submit" variant={x.variant} className="min-h-10 px-3">
                          {x.label}
                        </Button>
                      </form>
                    ))}
                    {hasPermission(user.role, "clientes:ver") && (a.status === "PENDENTE" || a.status === "CONFIRMADO") && (
                      <>
                        {a.status === "CONFIRMADO" && (
                          <WhatsAppButton kind="agendamento" id={a.id} template="AGENDAMENTO_CONFIRMADO" label="Enviar confirmação" className="min-h-10" />
                        )}
                        <WhatsAppButton kind="agendamento" id={a.id} template="AGENDAMENTO_LEMBRETE" label="Lembrete" className="min-h-10" />
                      </>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
