import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["ADMINISTRADOR", "FUNCIONARIO", "ATENDENTE", "CLIENTE"]);

export const vehicleCategoryEnum = pgEnum("vehicle_category", [
  "MOTO",
  "CARRO_PEQUENO",
  "CARRO_MEDIO",
  "SUV",
  "PICAPE",
]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "PENDENTE",
  "CONFIRMADO",
  "CANCELADO",
  "REAGENDADO",
  "NAO_COMPARECEU",
  "CONVERTIDO_EM_OS",
  "CONCLUIDO",
]);
