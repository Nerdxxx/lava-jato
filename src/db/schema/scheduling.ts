import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appointmentStatusEnum, vehicleCategoryEnum } from "./enums";
import { customers, users, vehicles } from "./identity";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const services = pgTable(
  "services",
  {
    id: id(),
    slug: varchar("slug", { length: 60 }).notNull().unique(),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description"),
    includes: jsonb("includes").$type<string[]>().notNull().default([]),
    excludes: jsonb("excludes").$type<string[]>().notNull().default([]),
    durationMinutes: integer("duration_minutes").notNull(),
    estimatedCostCents: integer("estimated_cost_cents"),
    displayOrder: integer("display_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check("services_duration_pos", sql`${t.durationMinutes} > 0`)],
);

/** Preço por serviço e categoria. Sem linha ativa = serviço indisponível para a categoria. */
export const servicePrices = pgTable(
  "service_prices",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    category: vehicleCategoryEnum("category").notNull(),
    priceCents: integer("price_cents").notNull(),
    promoPriceCents: integer("promo_price_cents"),
    promoUntil: timestamp("promo_until", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    durationMinutesOverride: integer("duration_minutes_override"),
  },
  (t) => [
    uniqueIndex("service_prices_service_category_uq").on(t.serviceId, t.category),
    check("service_prices_nonneg", sql`${t.priceCents} >= 0`),
    check("service_prices_duration_pos", sql`${t.durationMinutesOverride} IS NULL OR ${t.durationMinutesOverride} > 0`),
  ],
);

export const businessSettings = pgTable("business_settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** weekday: 0=domingo..6=sábado. Várias linhas por dia permitem pausas (manhã/tarde). */
export const operatingHours = pgTable(
  "operating_hours",
  {
    id: id(),
    weekday: smallint("weekday").notNull(),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
  },
  (t) => [check("operating_hours_weekday", sql`${t.weekday} between 0 and 6`)],
);

/** Vaga/box de lavagem (capacidade). */
export const resources = pgTable("resources", {
  id: id(),
  name: varchar("name", { length: 60 }).notNull(),
  active: boolean("active").notNull().default(true),
});

/** Bloqueios pontuais. resourceId nulo = bloqueia todas as vagas. */
export const scheduleBlocks = pgTable(
  "schedule_blocks",
  {
    id: id(),
    resourceId: uuid("resource_id").references(() => resources.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: varchar("reason", { length: 160 }),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [check("schedule_blocks_range", sql`${t.endsAt} > ${t.startsAt}`)],
);

export const holidays = pgTable("holidays", {
  id: id(),
  day: date("day").notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
});

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    code: varchar("code", { length: 12 }).notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id),
    category: vehicleCategoryEnum("category").notNull(),
    vehicleModel: varchar("vehicle_model", { length: 80 }).notNull(),
    vehiclePlate: varchar("vehicle_plate", { length: 8 }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    priceCents: integer("price_cents").notNull(),
    /** Adicionais contratados (snapshot: nome, preço e tempo na hora do agendamento). priceCents já inclui a soma. */
    addons: jsonb("addons").$type<{ slug: string; name: string; priceCents: number; durationMinutes?: number }[]>().notNull().default([]),
    status: appointmentStatusEnum("status").notNull().default("PENDENTE"),
    notes: text("notes"),
    rescheduledFromId: uuid("rescheduled_from_id"),
    trackingTokenHash: varchar("tracking_token_hash", { length: 64 }).unique(),
    createdAt: createdAt(),
  },
  (t) => [
    index("appointments_starts_idx").on(t.startsAt),
    index("appointments_customer_idx").on(t.customerId),
    check("appointments_range", sql`${t.endsAt} > ${t.startsAt}`),
    check("appointments_price_nonneg", sql`${t.priceCents} >= 0`),
  ],
);

export const appointmentHistory = pgTable("appointment_history", {
  id: id(),
  appointmentId: uuid("appointment_id")
    .notNull()
    .references(() => appointments.id),
  fromStatus: appointmentStatusEnum("from_status"),
  toStatus: appointmentStatusEnum("to_status").notNull(),
  changedBy: uuid("changed_by").references(() => users.id),
  note: text("note"),
  createdAt: createdAt(),
});
