import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { customers, users } from "./identity";
import { workOrders } from "./operations";
import { appointments } from "./scheduling";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const loyaltyKindEnum = pgEnum("loyalty_kind", ["GANHO", "RESGATE", "ESTORNO_RESGATE", "AJUSTE"]);

/**
 * Extrato de fidelidade (append-only). Saldo = soma de `points`.
 * GANHO: +1 por OS entregue e paga. RESGATE: −N pontos e desconto aplicado na OS.
 */
export const loyaltyTransactions = pgTable(
  "loyalty_transactions",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    workOrderId: uuid("work_order_id").references(() => workOrders.id),
    kind: loyaltyKindEnum("kind").notNull(),
    points: integer("points").notNull(),
    /** Desconto concedido (somente RESGATE / ESTORNO_RESGATE). */
    discountCents: integer("discount_cents"),
    reason: varchar("reason", { length: 160 }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("loyalty_customer_idx").on(t.customerId),
    // Um ganho por OS; resgates/estornos controlados pela aplicação dentro de transação.
    uniqueIndex("loyalty_ganho_uq").on(t.workOrderId).where(sql`${t.kind} = 'GANHO'`),
    check("loyalty_points_nonzero", sql`${t.points} <> 0`),
  ],
);

export const notificationChannelEnum = pgEnum("notification_channel", ["WHATSAPP"]);

/** Registro das mensagens geradas para o cliente (envio manual via link do WhatsApp). */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    workOrderId: uuid("work_order_id").references(() => workOrders.id),
    appointmentId: uuid("appointment_id").references(() => appointments.id),
    channel: notificationChannelEnum("channel").notNull().default("WHATSAPP"),
    template: varchar("template", { length: 40 }).notNull(),
    message: text("message").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_customer_idx").on(t.customerId, t.createdAt)],
);

/** Token de redefinição de senha (só o hash fica no banco; uso único; expira). */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("password_reset_user_idx").on(t.userId)],
);
