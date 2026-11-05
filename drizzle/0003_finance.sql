CREATE TYPE "public"."financial_status" AS ENUM('PENDENTE', 'PARCIAL', 'PAGO', 'ESTORNADO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."cash_movement_type" AS ENUM('PAGAMENTO', 'SUPRIMENTO', 'SANGRIA', 'ESTORNO');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('PENDENTE', 'PAGA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'OUTRO');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PAGO', 'ESTORNADO');--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_register_id" uuid NOT NULL,
	"type" "cash_movement_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" varchar(160),
	"payment_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_amount_pos" CHECK ("cash_movements"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "cash_registers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opening_cents" integer NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"expected_cents" integer,
	"counted_cents" integer,
	"difference_cents" integer,
	"notes" text,
	CONSTRAINT "cash_registers_opening_nonneg" CHECK ("cash_registers"."opening_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "expense_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" varchar(160) NOT NULL,
	"category_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"expense_date" date NOT NULL,
	"due_date" date,
	"status" "expense_status" DEFAULT 'PENDENTE' NOT NULL,
	"paid_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_pos" CHECK ("expenses"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"method_label" varchar(40),
	"amount_cents" integer NOT NULL,
	"status" "payment_status" DEFAULT 'PAGO' NOT NULL,
	"transaction_ref" varchar(80),
	"cash_register_id" uuid,
	"idempotency_key" varchar(64),
	"received_by" uuid,
	"refunded_at" timestamp with time zone,
	"refunded_by" uuid,
	"refund_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payments_amount_pos" CHECK ("payments"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "financial_status" "financial_status" DEFAULT 'PENDENTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_register_id_cash_registers_id_fk" FOREIGN KEY ("cash_register_id") REFERENCES "public"."cash_registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_register_id_cash_registers_id_fk" FOREIGN KEY ("cash_register_id") REFERENCES "public"."cash_registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refunded_by_users_id_fk" FOREIGN KEY ("refunded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_movements_register_idx" ON "cash_movements" USING btree ("cash_register_id");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "payments_wo_idx" ON "payments" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "payments_created_idx" ON "payments" USING btree ("created_at");