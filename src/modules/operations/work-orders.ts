import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  appointmentHistory,
  appointments,
  customers,
  serviceChecklistTemplates,
  servicePrices,
  services,
  users,
  vehicles,
  workOrderChecklistItems,
  workOrderStatusHistory,
  workOrders,
} from "@/db/schema";
import { normalizePhone, normalizePlate } from "@/lib/phone";
import { VEHICLE_CATEGORIES } from "@/modules/scheduling/booking";
import { canTransitionWorkOrder, REQUIRES_COMPLETE_CHECKLIST, type WorkOrderStatus } from "./state-machine";

export type OpResult<T> = { ok: true; value: T } | { ok: false; message: string };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

export type WorkOrderRow = typeof workOrders.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Checklist padrão por serviço (usado pelo seed e quando o serviço ainda não tem modelo). */
export const DEFAULT_EXTERNAL_CHECKLIST = [
  "Conferir estado inicial",
  "Conferir rodas e pneus",
  "Realizar pré-lavagem",
  "Lavar lataria",
  "Limpar vidros externos",
  "Enxaguar",
  "Secar",
  "Realizar inspeção final",
];
export const DEFAULT_INTERIOR_CHECKLIST = [
  "Aspirar bancos",
  "Aspirar carpetes",
  "Limpar painel",
  "Limpar portas",
  "Limpar console",
  "Limpar tapetes",
  "Limpar vidros internos",
  "Aspirar porta-malas",
  "Inspecionar interior",
];

async function buildChecklist(tx: Tx, serviceId: string): Promise<string[]> {
  const rows = await tx
    .select({ label: serviceChecklistTemplates.label })
    .from(serviceChecklistTemplates)
    .where(eq(serviceChecklistTemplates.serviceId, serviceId))
    .orderBy(asc(serviceChecklistTemplates.position));
  return rows.map((r) => r.label);
}

/** Garante o veículo do cliente (por placa, ou por modelo quando não há placa). */
async function ensureVehicle(
  tx: Tx,
  input: { customerId: string; category: (typeof VEHICLE_CATEGORIES)[number]; model: string; plate: string | null },
): Promise<string> {
  const existing = await tx
    .select({ id: vehicles.id, plate: vehicles.plate, model: vehicles.model })
    .from(vehicles)
    .where(eq(vehicles.customerId, input.customerId));
  const match = existing.find((v) =>
    input.plate ? v.plate === input.plate : !v.plate && v.model.toLowerCase() === input.model.toLowerCase(),
  );
  if (match) return match.id;
  const [created] = await tx
    .insert(vehicles)
    .values({ customerId: input.customerId, category: input.category, model: input.model, plate: input.plate })
    .returning({ id: vehicles.id });
  return created!.id;
}

async function insertWorkOrder(
  tx: Tx,
  data: {
    appointmentId: string | null;
    customerId: string;
    serviceId: string;
    serviceName: string;
    category: (typeof VEHICLE_CATEGORIES)[number];
    vehicleModel: string;
    vehiclePlate: string | null;
    priceCents: number;
    notes: string | null;
    userId: string;
  },
): Promise<WorkOrderRow> {
  const vehicleId = await ensureVehicle(tx, {
    customerId: data.customerId,
    category: data.category,
    model: data.vehicleModel,
    plate: data.vehiclePlate,
  });
  const [wo] = await tx
    .insert(workOrders)
    .values({
      appointmentId: data.appointmentId,
      customerId: data.customerId,
      vehicleId,
      serviceId: data.serviceId,
      serviceName: data.serviceName,
      category: data.category,
      vehicleModel: data.vehicleModel,
      vehiclePlate: data.vehiclePlate,
      priceCents: data.priceCents,
      notes: data.notes,
      status: "RECEBIDO",
      createdBy: data.userId,
    })
    .returning();
  const labels = await buildChecklist(tx, data.serviceId);
  if (labels.length) {
    await tx
      .insert(workOrderChecklistItems)
      .values(labels.map((label, position) => ({ workOrderId: wo!.id, position, label })));
  }
  await tx.insert(workOrderStatusHistory).values({
    workOrderId: wo!.id,
    fromStatus: null,
    toStatus: "RECEBIDO",
    changedBy: data.userId,
    note: data.appointmentId ? "Check-in de agendamento" : "Atendimento sem agendamento",
  });
  return wo!;
}

/** Check-in: converte um agendamento CONFIRMADO em OS. Idempotente (índice único por agendamento). */
export async function checkInAppointment(db: Database, appointmentId: string, userId: string): Promise<OpResult<WorkOrderRow>> {
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
  if (!appt) return fail("Agendamento não encontrado.");
  const [existing] = await db.select().from(workOrders).where(eq(workOrders.appointmentId, appointmentId)).limit(1);
  if (existing) return { ok: true, value: existing };
  if (appt.status !== "CONFIRMADO") return fail("Só é possível fazer check-in de agendamentos confirmados.");
  const [svc] = await db.select({ name: services.name }).from(services).where(eq(services.id, appt.serviceId)).limit(1);

  try {
    const wo = await db.transaction(async (tx) => {
      const flipped = await tx
        .update(appointments)
        .set({ status: "CONVERTIDO_EM_OS" })
        .where(and(eq(appointments.id, appt.id), eq(appointments.status, "CONFIRMADO")))
        .returning({ id: appointments.id });
      if (flipped.length === 0) throw new Error("CONCURRENT");
      await tx.insert(appointmentHistory).values({
        appointmentId: appt.id,
        fromStatus: "CONFIRMADO",
        toStatus: "CONVERTIDO_EM_OS",
        changedBy: userId,
        note: "Check-in",
      });
      return insertWorkOrder(tx, {
        appointmentId: appt.id,
        customerId: appt.customerId,
        serviceId: appt.serviceId,
        serviceName: svc?.name ?? "Serviço",
        category: appt.category,
        vehicleModel: appt.vehicleModel,
        vehiclePlate: appt.vehiclePlate,
        priceCents: appt.priceCents, // preço contratado no agendamento
        notes: appt.notes,
        userId,
      });
    });
    return { ok: true, value: wo };
  } catch (e) {
    if (e instanceof Error && e.message === "CONCURRENT") {
      const [again] = await db.select().from(workOrders).where(eq(workOrders.appointmentId, appointmentId)).limit(1);
      if (again) return { ok: true, value: again };
      return fail("O agendamento foi alterado. Atualize a página.");
    }
    throw e;
  }
}

const walkInSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(120),
  phone: z.string().trim().min(8, "Informe o WhatsApp do cliente."),
  category: z.enum(VEHICLE_CATEGORIES),
  serviceId: z.string().uuid(),
  vehicleModel: z.string().trim().min(2, "Informe o modelo do veículo.").max(80),
  plate: z.string().trim().max(10).optional(),
  notes: z.string().trim().max(500).optional(),
});

/** Atendimento sem agendamento (cliente chegou no local). Usa a tabela de preços vigente como snapshot. */
export async function createWalkInWorkOrder(
  db: Database,
  raw: z.input<typeof walkInSchema>,
  userId: string,
  now = new Date(),
): Promise<OpResult<WorkOrderRow>> {
  const parsed = walkInSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const input = parsed.data;
  const phone = normalizePhone(input.phone);
  if (!phone) return fail("WhatsApp inválido. Use o DDD.");
  let plate: string | null = null;
  if (input.plate) {
    plate = normalizePlate(input.plate);
    if (!plate) return fail("Placa inválida.");
  }
  const [svc] = await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.active, true))).limit(1);
  const [price] = svc
    ? await db
        .select()
        .from(servicePrices)
        .where(and(eq(servicePrices.serviceId, svc.id), eq(servicePrices.category, input.category), eq(servicePrices.active, true)))
        .limit(1)
    : [];
  if (!svc || !price) return fail("Este serviço não está disponível para a categoria escolhida.");
  const priceCents =
    price.promoPriceCents !== null && price.promoUntil !== null && price.promoUntil > now ? price.promoPriceCents : price.priceCents;

  const wo = await db.transaction(async (tx) => {
    await tx.insert(customers).values({ name: input.name, phone }).onConflictDoNothing({ target: customers.phone });
    const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.phone, phone)).limit(1);
    return insertWorkOrder(tx, {
      appointmentId: null,
      customerId: customer!.id,
      serviceId: svc.id,
      serviceName: svc.name,
      category: input.category,
      vehicleModel: input.vehicleModel,
      vehiclePlate: plate,
      priceCents,
      notes: input.notes || null,
      userId,
    });
  });
  return { ok: true, value: wo };
}

/** Transição de status da OS, com validação, trava de checklist e histórico. */
export async function changeWorkOrderStatus(
  db: Database,
  workOrderId: string,
  to: WorkOrderStatus,
  userId: string,
  note?: string,
  now = new Date(),
): Promise<OpResult<WorkOrderRow>> {
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
  if (!wo) return fail("Ordem de serviço não encontrada.");
  if (!canTransitionWorkOrder(wo.status, to)) return fail("Esta mudança de status não é permitida.");

  if (REQUIRES_COMPLETE_CHECKLIST.includes(to)) {
    const pending = await db
      .select({ id: workOrderChecklistItems.id })
      .from(workOrderChecklistItems)
      .where(and(eq(workOrderChecklistItems.workOrderId, wo.id), eq(workOrderChecklistItems.done, false)));
    if (pending.length > 0) return fail(`Conclua o checklist antes de avançar (${pending.length} item(ns) pendente(s)).`);
  }

  const patch: Partial<typeof workOrders.$inferInsert> = { status: to };
  if (to === "EM_LAVAGEM" && !wo.startedAt) patch.startedAt = now;
  if (to === "PRONTO_PARA_ENTREGA") patch.finishedAt = now;
  if (to === "ENTREGUE") patch.deliveredAt = now;

  try {
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(workOrders)
        .set(patch)
        .where(and(eq(workOrders.id, wo.id), eq(workOrders.status, wo.status)))
        .returning();
      if (rows.length === 0) throw new Error("CONCURRENT");
      await tx
        .insert(workOrderStatusHistory)
        .values({ workOrderId: wo.id, fromStatus: wo.status, toStatus: to, changedBy: userId, note: note ?? null });
      if (to === "ENTREGUE" && wo.appointmentId) {
        await tx
          .update(appointments)
          .set({ status: "CONCLUIDO" })
          .where(and(eq(appointments.id, wo.appointmentId), eq(appointments.status, "CONVERTIDO_EM_OS")));
        await tx.insert(appointmentHistory).values({
          appointmentId: wo.appointmentId,
          fromStatus: "CONVERTIDO_EM_OS",
          toStatus: "CONCLUIDO",
          changedBy: userId,
          note: "OS entregue",
        });
      }
      return rows[0]!;
    });
    return { ok: true, value: updated };
  } catch (e) {
    if (e instanceof Error && e.message === "CONCURRENT") return fail("A OS foi alterada por outra pessoa. Atualize a página.");
    throw e;
  }
}

export async function assignWorkOrder(db: Database, workOrderId: string, assigneeId: string | null): Promise<OpResult<undefined>> {
  if (assigneeId) {
    const [u] = await db.select({ active: users.active, role: users.role }).from(users).where(eq(users.id, assigneeId)).limit(1);
    if (!u || !u.active || u.role === "CLIENTE") return fail("Responsável inválido.");
  }
  const rows = await db
    .update(workOrders)
    .set({ assignedTo: assigneeId })
    .where(and(eq(workOrders.id, workOrderId), inArray(workOrders.status, ["AGUARDANDO_RECEPCAO", "RECEBIDO", "NA_FILA", "EM_LAVAGEM", "EM_FINALIZACAO", "AGUARDANDO_INSPECAO", "PRONTO_PARA_ENTREGA"])))
    .returning({ id: workOrders.id });
  return rows.length ? { ok: true, value: undefined } : fail("OS não encontrada ou já encerrada.");
}

export async function toggleChecklistItem(
  db: Database,
  itemId: string,
  done: boolean,
  userId: string,
  notes?: string,
): Promise<OpResult<undefined>> {
  const [row] = await db
    .select({ item: workOrderChecklistItems, status: workOrders.status })
    .from(workOrderChecklistItems)
    .innerJoin(workOrders, eq(workOrders.id, workOrderChecklistItems.workOrderId))
    .where(eq(workOrderChecklistItems.id, itemId))
    .limit(1);
  if (!row) return fail("Item não encontrado.");
  if (row.status === "ENTREGUE" || row.status === "CANCELADO") return fail("A OS já foi encerrada.");
  await db
    .update(workOrderChecklistItems)
    .set({
      done,
      doneBy: done ? userId : null,
      doneAt: done ? new Date() : null,
      notes: notes?.trim() ? notes.trim().slice(0, 300) : row.item.notes,
    })
    .where(eq(workOrderChecklistItems.id, itemId));
  return { ok: true, value: undefined };
}

/** Desconto autorizado (em centavos). O valor final nunca fica negativo. */
export async function applyDiscount(db: Database, workOrderId: string, discountCents: number): Promise<OpResult<undefined>> {
  if (!Number.isInteger(discountCents) || discountCents < 0) return fail("Desconto inválido.");
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
  if (!wo) return fail("Ordem de serviço não encontrada.");
  if (wo.status === "ENTREGUE" || wo.status === "CANCELADO") return fail("A OS já foi encerrada.");
  if (discountCents > wo.priceCents) return fail("O desconto não pode ser maior que o valor do serviço.");
  await db.update(workOrders).set({ discountCents }).where(eq(workOrders.id, workOrderId));
  return { ok: true, value: undefined };
}

export async function updateNotes(db: Database, workOrderId: string, notes: string): Promise<void> {
  await db.update(workOrders).set({ notes: notes.trim().slice(0, 1000) || null }).where(eq(workOrders.id, workOrderId));
}
