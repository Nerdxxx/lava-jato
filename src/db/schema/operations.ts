import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { vehicleCategoryEnum } from "./enums";
import { customers, users, vehicles } from "./identity";
import { appointments, services } from "./scheduling";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const workOrderStatusEnum = pgEnum("work_order_status", [
  "AGUARDANDO_RECEPCAO",
  "RECEBIDO",
  "NA_FILA",
  "EM_LAVAGEM",
  "EM_FINALIZACAO",
  "AGUARDANDO_INSPECAO",
  "PRONTO_PARA_ENTREGA",
  "ENTREGUE",
  "CANCELADO",
]);

export const photoKindEnum = pgEnum("photo_kind", ["ANTES", "DURANTE", "DEPOIS", "AVARIA"]);

export const financialStatusEnum = pgEnum("financial_status", ["PENDENTE", "PARCIAL", "PAGO", "ESTORNADO", "CANCELADO"]);

/** Modelo de checklist por serviço. Copiado para cada OS no momento da criação. */
export const serviceChecklistTemplates = pgTable(
  "service_checklist_templates",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    position: integer("position").notNull(),
    label: varchar("label", { length: 120 }).notNull(),
  },
  (t) => [index("checklist_templates_service_idx").on(t.serviceId, t.position)],
);

export const workOrders = pgTable(
  "work_orders",
  {
    id: id(),
    /** Número sequencial humano (OS-00001). */
    number: integer("number").generatedAlwaysAsIdentity().notNull(),
    appointmentId: uuid("appointment_id").references(() => appointments.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    serviceName: varchar("service_name", { length: 80 }).notNull(),
    category: vehicleCategoryEnum("category").notNull(),
    vehicleModel: varchar("vehicle_model", { length: 80 }).notNull(),
    vehiclePlate: varchar("vehicle_plate", { length: 8 }),
    /** Preço contratado (snapshot) e desconto autorizado, em centavos. */
    priceCents: integer("price_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    assignedTo: uuid("assigned_to").references(() => users.id),
    status: workOrderStatusEnum("status").notNull().default("RECEBIDO"),
    /** Derivado dos pagamentos; atualizado na mesma transação de cada pagamento/estorno. */
    financialStatus: financialStatusEnum("financial_status").notNull().default("PENDENTE"),
    notes: text("notes"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("work_orders_number_uq").on(t.number),
    uniqueIndex("work_orders_appointment_uq").on(t.appointmentId),
    index("work_orders_status_idx").on(t.status),
    index("work_orders_customer_idx").on(t.customerId),
    check("work_orders_money", sql`${t.priceCents} >= 0 AND ${t.discountCents} >= 0 AND ${t.discountCents} <= ${t.priceCents}`),
  ],
);

export const workOrderStatusHistory = pgTable(
  "work_order_status_history",
  {
    id: id(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    fromStatus: workOrderStatusEnum("from_status"),
    toStatus: workOrderStatusEnum("to_status").notNull(),
    changedBy: uuid("changed_by").references(() => users.id),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("wo_history_wo_idx").on(t.workOrderId)],
);

export const workOrderChecklistItems = pgTable(
  "work_order_checklist_items",
  {
    id: id(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    position: integer("position").notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    done: boolean("done").notNull().default(false),
    doneBy: uuid("done_by").references(() => users.id),
    doneAt: timestamp("done_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [index("wo_checklist_wo_idx").on(t.workOrderId, t.position)],
);

export const workOrderPhotos = pgTable(
  "work_order_photos",
  {
    id: id(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    kind: photoKindEnum("kind").notNull(),
    /** Caminho relativo ao STORAGE_DIR (armazenamento privado, nunca em /public). */
    storagePath: varchar("storage_path", { length: 300 }).notNull(),
    mimeType: varchar("mime_type", { length: 60 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("wo_photos_wo_idx").on(t.workOrderId)],
);
