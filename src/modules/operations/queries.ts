import { and, asc, desc, eq, gte, inArray, isNull, notExists, or, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  appointments,
  customers,
  users,
  workOrderChecklistItems,
  workOrderPhotos,
  workOrderStatusHistory,
  workOrders,
} from "@/db/schema";
import { addDays, localDateOf, localToUtc } from "@/lib/time";
import { OPEN_STATUSES, type WorkOrderStatus } from "./state-machine";

export interface ViewerScope {
  id: string;
  role: "ADMINISTRADOR" | "FUNCIONARIO" | "ATENDENTE" | "CLIENTE";
}

function visibility(viewer: ViewerScope): SQL | undefined {
  return viewer.role === "FUNCIONARIO" ? or(isNull(workOrders.assignedTo), eq(workOrders.assignedTo, viewer.id)) : undefined;
}

/** Dados da fila operacional: OS abertas, entregues hoje e agendamentos de hoje ainda sem check-in. */
export async function getBoard(db: Database, viewer: ViewerScope, now = new Date()) {
  const todayStart = localToUtc(localDateOf(now), "00:00");
  const tomorrowStart = localToUtc(addDays(localDateOf(now), 1), "00:00");

  const orders = await db
    .select({
      wo: workOrders,
      customerName: customers.name,
      assigneeName: users.name,
    })
    .from(workOrders)
    .innerJoin(customers, eq(customers.id, workOrders.customerId))
    .leftJoin(users, eq(users.id, workOrders.assignedTo))
    .where(
      and(
        or(inArray(workOrders.status, [...OPEN_STATUSES]), and(eq(workOrders.status, "ENTREGUE"), gte(workOrders.deliveredAt, todayStart))),
        visibility(viewer),
      ),
    )
    .orderBy(asc(workOrders.receivedAt));

  const scheduled = await db
    .select({ a: appointments, customerName: customers.name })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(
      and(
        inArray(appointments.status, ["PENDENTE", "CONFIRMADO"]),
        gte(appointments.startsAt, todayStart),
        // sem OS vinculada
        notExists(db.select({ x: workOrders.id }).from(workOrders).where(eq(workOrders.appointmentId, appointments.id))),
      ),
    )
    .orderBy(asc(appointments.startsAt));

  return { orders, scheduled: scheduled.filter((s) => s.a.startsAt < tomorrowStart), now };
}

export async function listWorkOrders(db: Database, viewer: ViewerScope, status?: WorkOrderStatus, limit = 100) {
  return db
    .select({ wo: workOrders, customerName: customers.name })
    .from(workOrders)
    .innerJoin(customers, eq(customers.id, workOrders.customerId))
    .where(and(status ? eq(workOrders.status, status) : undefined, visibility(viewer)))
    .orderBy(desc(workOrders.createdAt))
    .limit(limit);
}

export async function getWorkOrderDetail(db: Database, id: string) {
  const [row] = await db
    .select({ wo: workOrders, customerName: customers.name, customerPhone: customers.phone, assigneeName: users.name })
    .from(workOrders)
    .innerJoin(customers, eq(customers.id, workOrders.customerId))
    .leftJoin(users, eq(users.id, workOrders.assignedTo))
    .where(eq(workOrders.id, id))
    .limit(1);
  if (!row) return null;
  const [checklist, photos, history] = await Promise.all([
    db.select().from(workOrderChecklistItems).where(eq(workOrderChecklistItems.workOrderId, id)).orderBy(asc(workOrderChecklistItems.position)),
    db.select().from(workOrderPhotos).where(eq(workOrderPhotos.workOrderId, id)).orderBy(asc(workOrderPhotos.createdAt)),
    db
      .select({ h: workOrderStatusHistory, userName: users.name })
      .from(workOrderStatusHistory)
      .leftJoin(users, eq(users.id, workOrderStatusHistory.changedBy))
      .where(eq(workOrderStatusHistory.workOrderId, id))
      .orderBy(asc(workOrderStatusHistory.createdAt)),
  ]);
  return { ...row, checklist, photos, history };
}

export async function listStaff(db: Database) {
  return db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.active, true), inArray(users.role, ["ADMINISTRADOR", "FUNCIONARIO", "ATENDENTE"])))
    .orderBy(asc(users.name));
}
