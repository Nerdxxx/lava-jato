import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { workOrders } from "./operations";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const paymentMethodEnum = pgEnum("payment_method", ["DINHEIRO", "PIX", "DEBITO", "CREDITO", "OUTRO"]);
export const paymentStatusEnum = pgEnum("payment_status", ["PAGO", "ESTORNADO"]);
export const cashMovementTypeEnum = pgEnum("cash_movement_type", ["PAGAMENTO", "SUPRIMENTO", "SANGRIA", "ESTORNO"]);
export const expenseStatusEnum = pgEnum("expense_status", ["PENDENTE", "PAGA", "CANCELADA"]);

/** Caixa (gaveta de dinheiro). Fechado = imutável; correções entram como lançamentos no caixa seguinte. */
export const cashRegisters = pgTable(
  "cash_registers",
  {
    id: id(),
    openedBy: uuid("opened_by")
      .notNull()
      .references(() => users.id),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    openingCents: integer("opening_cents").notNull(),
    closedBy: uuid("closed_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** Valor esperado e contado no fechamento (snapshot). */
    expectedCents: integer("expected_cents"),
    countedCents: integer("counted_cents"),
    differenceCents: integer("difference_cents"),
    notes: text("notes"),
  },
  (t) => [check("cash_registers_opening_nonneg", sql`${t.openingCents} >= 0`)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    method: paymentMethodEnum("method").notNull(),
    /** Rótulo livre quando o meio é OUTRO (ex.: "Vale"). */
    methodLabel: varchar("method_label", { length: 40 }),
    amountCents: integer("amount_cents").notNull(),
    status: paymentStatusEnum("status").notNull().default("PAGO"),
    transactionRef: varchar("transaction_ref", { length: 80 }),
    /** Caixa em que o dinheiro entrou (somente DINHEIRO). */
    cashRegisterId: uuid("cash_register_id").references(() => cashRegisters.id),
    /** Evita lançamento duplicado em reenvio de formulário/requisição repetida. */
    idempotencyKey: varchar("idempotency_key", { length: 64 }).unique(),
    receivedBy: uuid("received_by").references(() => users.id),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundedBy: uuid("refunded_by").references(() => users.id),
    refundReason: text("refund_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_wo_idx").on(t.workOrderId),
    index("payments_created_idx").on(t.createdAt),
    check("payments_amount_pos", sql`${t.amountCents} > 0`),
  ],
);

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: id(),
    cashRegisterId: uuid("cash_register_id")
      .notNull()
      .references(() => cashRegisters.id),
    type: cashMovementTypeEnum("type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    reason: varchar("reason", { length: 160 }),
    paymentId: uuid("payment_id").references(() => payments.id),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("cash_movements_register_idx").on(t.cashRegisterId), check("cash_movements_amount_pos", sql`${t.amountCents} > 0`)],
);

export const expenseCategories = pgTable("expense_categories", {
  id: id(),
  name: varchar("name", { length: 60 }).notNull().unique(),
  active: boolean("active").notNull().default(true),
});

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    description: varchar("description", { length: 160 }).notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    amountCents: integer("amount_cents").notNull(),
    /** Data da competência/compra (dia local). */
    expenseDate: date("expense_date").notNull(),
    dueDate: date("due_date"),
    status: expenseStatusEnum("status").notNull().default("PENDENTE"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_date_idx").on(t.expenseDate), check("expenses_amount_pos", sql`${t.amountCents} > 0`)],
);
