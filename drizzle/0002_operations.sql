CREATE TYPE "public"."photo_kind" AS ENUM('ANTES', 'DURANTE', 'DEPOIS', 'AVARIA');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('AGUARDANDO_RECEPCAO', 'RECEBIDO', 'NA_FILA', 'EM_LAVAGEM', 'EM_FINALIZACAO', 'AGUARDANDO_INSPECAO', 'PRONTO_PARA_ENTREGA', 'ENTREGUE', 'CANCELADO');--> statement-breakpoint
CREATE TABLE "service_checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" varchar(120) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" varchar(120) NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_by" uuid,
	"done_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "work_order_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"kind" "photo_kind" NOT NULL,
	"storage_path" varchar(300) NOT NULL,
	"mime_type" varchar(60) NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"from_status" "work_order_status",
	"to_status" "work_order_status" NOT NULL,
	"changed_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "work_orders_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"appointment_id" uuid,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"service_id" uuid NOT NULL,
	"service_name" varchar(80) NOT NULL,
	"category" "vehicle_category" NOT NULL,
	"vehicle_model" varchar(80) NOT NULL,
	"vehicle_plate" varchar(8),
	"price_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"assigned_to" uuid,
	"status" "work_order_status" DEFAULT 'RECEBIDO' NOT NULL,
	"notes" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_money" CHECK ("work_orders"."price_cents" >= 0 AND "work_orders"."discount_cents" >= 0 AND "work_orders"."discount_cents" <= "work_orders"."price_cents")
);
--> statement-breakpoint
ALTER TABLE "service_checklist_templates" ADD CONSTRAINT "service_checklist_templates_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_checklist_items" ADD CONSTRAINT "work_order_checklist_items_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_checklist_items" ADD CONSTRAINT "work_order_checklist_items_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_photos" ADD CONSTRAINT "work_order_photos_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_photos" ADD CONSTRAINT "work_order_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_status_history" ADD CONSTRAINT "work_order_status_history_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_status_history" ADD CONSTRAINT "work_order_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_templates_service_idx" ON "service_checklist_templates" USING btree ("service_id","position");--> statement-breakpoint
CREATE INDEX "wo_checklist_wo_idx" ON "work_order_checklist_items" USING btree ("work_order_id","position");--> statement-breakpoint
CREATE INDEX "wo_photos_wo_idx" ON "work_order_photos" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "wo_history_wo_idx" ON "work_order_status_history" USING btree ("work_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_orders_number_uq" ON "work_orders" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "work_orders_appointment_uq" ON "work_orders" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "work_orders_status_idx" ON "work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "work_orders_customer_idx" ON "work_orders" USING btree ("customer_id");