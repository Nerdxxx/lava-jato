import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { vehicleCategoryEnum } from "./enums";
import { users } from "./identity";
import { workOrders } from "./operations";
import { services } from "./scheduling";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", ["ENTRADA", "SAIDA", "AJUSTE", "CONSUMO_OS"]);

/**
 * Produto/insumo de estoque. A quantidade é inteira na menor unidade de controle (ml, g, un).
 * Pode ficar negativa apenas por consumo automático de OS (sinaliza cadastro desatualizado).
 */
export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: id(),
    name: varchar("name", { length: 80 }).notNull().unique(),
    unit: varchar("unit", { length: 12 }).notNull(),
    quantity: integer("quantity").notNull().default(0),
    minQuantity: integer("min_quantity").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check("inventory_items_min_nonneg", sql`${t.minQuantity} >= 0`)],
);

/** Movimentações são append-only: o saldo do item é sempre explicado pelo histórico. */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id),
    type: inventoryMovementTypeEnum("type").notNull(),
    /** Variação com sinal (+ entrada, − saída/consumo). */
    delta: integer("delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    workOrderId: uuid("work_order_id").references(() => workOrders.id),
    reason: varchar("reason", { length: 160 }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("inventory_movements_item_idx").on(t.itemId, t.createdAt),
    // Baixa automática idempotente: no máximo um consumo por item e OS.
    uniqueIndex("inventory_movements_consumo_uq").on(t.itemId, t.workOrderId).where(sql`${t.type} = 'CONSUMO_OS'`),
    check("inventory_movements_delta_nonzero", sql`${t.delta} <> 0`),
  ],
);

/** Quanto de cada insumo um serviço consome. category nula = vale para todas as categorias. */
export const serviceConsumptionRules = pgTable(
  "service_consumption_rules",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id),
    category: vehicleCategoryEnum("category"),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    uniqueIndex("consumption_rules_cat_uq").on(t.serviceId, t.itemId, t.category).where(sql`${t.category} IS NOT NULL`),
    uniqueIndex("consumption_rules_all_uq").on(t.serviceId, t.itemId).where(sql`${t.category} IS NULL`),
    check("consumption_rules_qty_pos", sql`${t.quantity} > 0`),
  ],
);
