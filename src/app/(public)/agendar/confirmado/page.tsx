import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { getDb } from "@/db/client";
import { appointments, services } from "@/db/schema";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTimeBR } from "@/lib/time";
import { formatBRL } from "@/lib/utils";
import { STATUS_LABEL, STATUS_TONE } from "@/modules/scheduling/labels";
import { BOOKING_COOKIE } from "../cookie";

export const metadata = { title: "Agendamento solicitado" };
export const dynamic = "force-dynamic";

export default async function ConfirmedPage() {
  const code = (await cookies()).get(BOOKING_COOKIE)?.value;
  const db = await getDb();
  const rows = code
    ? await db
        .select({ a: appointments, serviceName: services.name })
        .from(appointments)
        .innerJoin(services, eq(services.id, appointments.serviceId))
        .where(eq(appointments.code, code))
        .limit(1)
    : [];
  const row = rows[0];
  if (!row) {
    return (
      <EmptyState
        title="Nenhum agendamento recente neste navegador"
        description="Para consultar um agendamento, use o código e o WhatsApp informados."
      />
    );
  }
  const { a, serviceName } = row;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card className="space-y-4 text-center">
        <h1 className="text-2xl font-extrabold text-navy-950">Solicitação enviada!</h1>
        <p className="text-sm text-muted">Guarde o código do seu agendamento:</p>
        <p className="text-3xl font-extrabold tracking-widest">{a.code}</p>
        <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-left text-sm">
          <dt className="text-muted">Serviço</dt>
          <dd>{serviceName}</dd>
          <dt className="text-muted">Quando</dt>
          <dd>{formatDateTimeBR(a.startsAt)}</dd>
          <dt className="text-muted">Veículo</dt>
          <dd>{a.vehicleModel}</dd>
          <dt className="text-muted">Valor</dt>
          <dd>{formatBRL(a.priceCents)}</dd>
        </dl>
        <p className="text-xs text-muted">
          O lava jato vai confirmar seu horário. Para consultar, reagendar ou cancelar, use o código e seu WhatsApp.
        </p>
      </Card>
      <div className="text-center">
        <Link href="/agendamento" className={buttonVariants({ variant: "outline" })}>
          Consultar agendamento
        </Link>
      </div>
    </div>
  );
}
