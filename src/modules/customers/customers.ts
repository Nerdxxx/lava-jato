import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { appointments, customers, services, vehicles, workOrders } from "@/db/schema";
import { normalizePlate } from "@/lib/phone";
import { VEHICLE_CATEGORIES } from "@/modules/scheduling/booking";
import type { OpResult } from "@/modules/operations/work-orders";

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Busca por nome, telefone, placa ou modelo. */
export async function searchCustomers(db: Database, query: string, limit = 50) {
  const q = query.trim();
  const base = db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      createdAt: customers.createdAt,
      vehicleCount: sql<number>`(select count(*)::int from ${vehicles} v where v.customer_id = ${customers.id})`,
    })
    .from(customers);
  if (!q) return base.orderBy(desc(customers.createdAt)).limit(limit);

  const like = `%${escapeLike(q)}%`;
  const digits = q.replace(/\D/g, "");
  const plate = q.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const conditions = [
    ilike(customers.name, like),
    sql`exists (select 1 from ${vehicles} v where v.customer_id = ${customers.id} and v.model ilike ${like})`,
  ];
  if (digits.length >= 3) conditions.push(ilike(customers.phone, `%${digits}%`));
  if (plate.length >= 3) {
    conditions.push(sql`exists (select 1 from ${vehicles} v where v.customer_id = ${customers.id} and v.plate like ${`%${escapeLike(plate)}%`})`);
  }
  return base.where(or(...conditions)).orderBy(customers.name).limit(limit);
}

export async function getCustomer360(db: Database, customerId: string) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return null;
  const [vehicleRows, appointmentRows, orderRows] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.customerId, customerId)).orderBy(desc(vehicles.createdAt)),
    db
      .select({ a: appointments, serviceName: services.name })
      .from(appointments)
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .where(eq(appointments.customerId, customerId))
      .orderBy(desc(appointments.startsAt))
      .limit(20),
    db.select().from(workOrders).where(eq(workOrders.customerId, customerId)).orderBy(desc(workOrders.createdAt)).limit(20),
  ]);
  const totalSpent = orderRows
    .filter((o) => o.status === "ENTREGUE")
    .reduce((sum, o) => sum + (o.priceCents - o.discountCents), 0);
  return { customer, vehicles: vehicleRows, appointments: appointmentRows, workOrders: orderRows, totalSpentCents: totalSpent };
}

const updateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  email: z.string().trim().email("E-mail inválido.").max(254).or(z.literal("")).optional(),
  notes: z.string().trim().max(1000).optional(),
  marketingConsent: z.boolean(),
});

export async function updateCustomer(db: Database, id: string, raw: z.input<typeof updateSchema>): Promise<OpResult<undefined>> {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const rows = await db
    .update(customers)
    .set({
      name: parsed.data.name,
      email: parsed.data.email || null,
      notes: parsed.data.notes || null,
      marketingConsent: parsed.data.marketingConsent,
    })
    .where(eq(customers.id, id))
    .returning({ id: customers.id });
  return rows.length ? { ok: true, value: undefined } : fail("Cliente não encontrado.");
}

const vehicleSchema = z.object({
  category: z.enum(VEHICLE_CATEGORIES),
  model: z.string().trim().min(2, "Informe o modelo.").max(80),
  brand: z.string().trim().max(60).optional(),
  color: z.string().trim().max(40).optional(),
  year: z.number().int().min(1950).max(2100).optional(),
  plate: z.string().trim().max(10).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function addVehicle(db: Database, customerId: string, raw: z.input<typeof vehicleSchema>): Promise<OpResult<{ id: string }>> {
  const parsed = vehicleSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const v = parsed.data;
  let plate: string | null = null;
  if (v.plate) {
    plate = normalizePlate(v.plate);
    if (!plate) return fail("Placa inválida.");
  }
  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return fail("Cliente não encontrado.");
  if (plate) {
    const dup = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.customerId, customerId), eq(vehicles.plate, plate)))
      .limit(1);
    if (dup.length) return fail("Este cliente já tem um veículo com esta placa.");
  }
  const [row] = await db
    .insert(vehicles)
    .values({
      customerId,
      category: v.category,
      model: v.model,
      brand: v.brand || null,
      color: v.color || null,
      year: v.year ?? null,
      plate,
      notes: v.notes || null,
    })
    .returning({ id: vehicles.id });
  return { ok: true, value: { id: row!.id } };
}
