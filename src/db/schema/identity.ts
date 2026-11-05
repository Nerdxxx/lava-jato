import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { roleEnum, vehicleCategoryEnum } from "./enums";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const users = pgTable("users", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    userAgent: varchar("user_agent", { length: 255 }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    key: varchar("key", { length: 320 }).notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_key_idx").on(t.key, t.attemptedAt)],
);

export const customers = pgTable("customers", {
  id: id(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "set null" })
    .unique(),
  name: varchar("name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  email: varchar("email", { length: 254 }),
  notes: text("notes"),
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    category: vehicleCategoryEnum("category").notNull(),
    plate: varchar("plate", { length: 8 }),
    brand: varchar("brand", { length: 60 }),
    model: varchar("model", { length: 80 }).notNull(),
    color: varchar("color", { length: 40 }),
    year: integer("year"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("vehicles_customer_idx").on(t.customerId), index("vehicles_plate_idx").on(t.plate)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 80 }).notNull(),
    entity: varchar("entity", { length: 60 }),
    entityId: varchar("entity_id", { length: 64 }),
    details: text("details"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId)],
);
