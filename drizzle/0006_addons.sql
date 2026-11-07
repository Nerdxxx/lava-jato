ALTER TABLE "appointments" ADD COLUMN "addons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "addons" jsonb DEFAULT '[]'::jsonb NOT NULL;