-- Impede sobreposição de agendamentos ativos na mesma vaga (garantia final contra concorrência).
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "resource_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" IN ('PENDENTE', 'CONFIRMADO', 'CONVERTIDO_EM_OS'));
