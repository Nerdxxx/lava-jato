import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { appointments, customers, notifications, services, workOrders } from "@/db/schema";
import { formatBRL } from "@/lib/utils";
import { amountDue, getPaymentSummary } from "@/modules/finance/payments";
import { formatOsNumber } from "@/modules/operations/state-machine";

/** Link "clique para conversar" do WhatsApp (funciona sem API paga). Telefone: dígitos com DDD. */
export function waLink(phoneDigits: string, text?: string): string {
  const base = `https://wa.me/55${phoneDigits.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const when = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Maceio", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

export const WO_TEMPLATES = ["OS_RECEBIDA", "OS_PRONTA", "OS_AGRADECIMENTO"] as const;
export const APPT_TEMPLATES = ["AGENDAMENTO_CONFIRMADO", "AGENDAMENTO_LEMBRETE"] as const;
export type WoTemplate = (typeof WO_TEMPLATES)[number];
export type ApptTemplate = (typeof APPT_TEMPLATES)[number];

export const TEMPLATE_LABEL: Record<WoTemplate | ApptTemplate, string> = {
  OS_RECEBIDA: "Veículo recebido",
  OS_PRONTA: "Pronto para retirada",
  OS_AGRADECIMENTO: "Agradecimento",
  AGENDAMENTO_CONFIRMADO: "Confirmar agendamento",
  AGENDAMENTO_LEMBRETE: "Lembrete do horário",
};

export async function buildWorkOrderMessage(db: Database, workOrderId: string, template: WoTemplate, businessName: string, appUrl: string) {
  const [row] = await db
    .select({ wo: workOrders, name: customers.name, phone: customers.phone })
    .from(workOrders)
    .innerJoin(customers, eq(customers.id, workOrders.customerId))
    .where(eq(workOrders.id, workOrderId))
    .limit(1);
  if (!row) return null;
  const { wo } = row;
  const os = formatOsNumber(wo.number);
  const pay = await getPaymentSummary(db, wo.id);
  const remaining = pay?.remainingCents ?? amountDue(wo);
  const hi = `Olá, ${firstName(row.name)}!`;
  let text: string;
  if (template === "OS_RECEBIDA") {
    text = `${hi} Recebemos seu ${wo.vehicleModel} aqui no ${businessName} (${os} — ${wo.serviceName}). Avisaremos assim que estiver pronto.`;
  } else if (template === "OS_PRONTA") {
    text =
      `${hi} Seu ${wo.vehicleModel} está pronto para retirada no ${businessName} (${os}).` +
      (remaining > 0 ? ` Valor a pagar: ${formatBRL(remaining)}.` : " O pagamento já está quitado.") +
      " Obrigado pela preferência!";
  } else {
    text = `${hi} Obrigado por lavar seu ${wo.vehicleModel} com o ${businessName}. Acompanhe seu histórico e pontos de fidelidade em ${appUrl}/cliente. Até a próxima!`;
  }
  return { customerId: wo.customerId, phone: row.phone, text, workOrderId: wo.id, appointmentId: null as string | null };
}

export async function buildAppointmentMessage(db: Database, appointmentId: string, template: ApptTemplate, businessName: string, appUrl: string) {
  const [row] = await db
    .select({ a: appointments, name: customers.name, phone: customers.phone, service: services.name })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!row) return null;
  const { a } = row;
  const hi = `Olá, ${firstName(row.name)}!`;
  const manage = `Para cancelar ou reagendar: ${appUrl}/agendamento (código ${a.code}).`;
  const text =
    template === "AGENDAMENTO_CONFIRMADO"
      ? `${hi} Seu agendamento no ${businessName} está confirmado: ${row.service} para ${a.vehicleModel}, ${when(a.startsAt)}. Valor: ${formatBRL(a.priceCents)}. ${manage}`
      : `${hi} Lembrete: seu horário no ${businessName} é ${when(a.startsAt)} (${row.service}). Te esperamos! ${manage}`;
  return { customerId: a.customerId, phone: row.phone, text, workOrderId: null as string | null, appointmentId: a.id };
}

export async function logNotification(
  db: Database,
  input: { customerId: string; workOrderId: string | null; appointmentId: string | null; template: string; message: string; userId: string },
) {
  await db.insert(notifications).values({
    customerId: input.customerId,
    workOrderId: input.workOrderId,
    appointmentId: input.appointmentId,
    template: input.template,
    message: input.message,
    createdBy: input.userId,
  });
}

export async function listNotificationsFor(db: Database, where: { workOrderId?: string; customerId?: string }, limit = 10) {
  const cond = where.workOrderId ? eq(notifications.workOrderId, where.workOrderId) : where.customerId ? eq(notifications.customerId, where.customerId) : undefined;
  return db.select().from(notifications).where(and(cond)).orderBy(desc(notifications.createdAt)).limit(limit);
}
