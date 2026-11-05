CREATE TYPE "public"."appointment_status" AS ENUM('PENDENTE', 'CONFIRMADO', 'CANCELADO', 'REAGENDADO', 'NAO_COMPARECEU', 'CONVERTIDO_EM_OS', 'CONCLUIDO');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMINISTRADOR', 'FUNCIONARIO', 'ATENDENTE', 'CLIENTE');--> statement-breakpoint
CREATE TYPE "public"."vehicle_category" AS ENUM('MOTO', 'CARRO_PEQUENO', 'CARRO_MEDIO', 'SUV', 'PICAPE');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity" varchar(60),
	"entity_id" varchar(64),
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" varchar(120) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(254),
	"notes" text,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(320) NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" varchar(255),
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"category" "vehicle_category" NOT NULL,
	"plate" varchar(8),
	"brand" varchar(60),
	"model" varchar(80) NOT NULL,
	"color" varchar(40),
	"year" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"from_status" "appointment_status",
	"to_status" "appointment_status" NOT NULL,
	"changed_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(12) NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"service_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"category" "vehicle_category" NOT NULL,
	"vehicle_model" varchar(80) NOT NULL,
	"vehicle_plate" varchar(8),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"price_cents" integer NOT NULL,
	"status" "appointment_status" DEFAULT 'PENDENTE' NOT NULL,
	"notes" text,
	"rescheduled_from_id" uuid,
	"tracking_token_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_code_unique" UNIQUE("code"),
	CONSTRAINT "appointments_tracking_token_hash_unique" UNIQUE("tracking_token_hash"),
	CONSTRAINT "appointments_range" CHECK ("appointments"."ends_at" > "appointments"."starts_at"),
	CONSTRAINT "appointments_price_nonneg" CHECK ("appointments"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "business_settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "holidays_day_unique" UNIQUE("day")
);
--> statement-breakpoint
CREATE TABLE "operating_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "operating_hours_weekday" CHECK ("operating_hours"."weekday" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" varchar(160),
	"created_by" uuid,
	CONSTRAINT "schedule_blocks_range" CHECK ("schedule_blocks"."ends_at" > "schedule_blocks"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "service_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"category" "vehicle_category" NOT NULL,
	"price_cents" integer NOT NULL,
	"promo_price_cents" integer,
	"promo_until" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"duration_minutes_override" integer,
	CONSTRAINT "service_prices_nonneg" CHECK ("service_prices"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(60) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"includes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excludes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_minutes" integer NOT NULL,
	"estimated_cost_cents" integer,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug"),
	CONSTRAINT "services_duration_pos" CHECK ("services"."duration_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_history" ADD CONSTRAINT "appointment_history_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_history" ADD CONSTRAINT "appointment_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "login_attempts_key_idx" ON "login_attempts" USING btree ("key","attempted_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vehicles_customer_idx" ON "vehicles" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "vehicles_plate_idx" ON "vehicles" USING btree ("plate");--> statement-breakpoint
CREATE INDEX "appointments_starts_idx" ON "appointments" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "appointments_customer_idx" ON "appointments" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_prices_service_category_uq" ON "service_prices" USING btree ("service_id","category");