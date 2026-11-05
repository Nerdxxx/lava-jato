export const APPOINTMENT_STATUSES = [
  "PENDENTE",
  "CONFIRMADO",
  "CANCELADO",
  "REAGENDADO",
  "NAO_COMPARECEU",
  "CONVERTIDO_EM_OS",
  "CONCLUIDO",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  PENDENTE: ["CONFIRMADO", "CANCELADO", "REAGENDADO"],
  CONFIRMADO: ["CANCELADO", "REAGENDADO", "NAO_COMPARECEU", "CONVERTIDO_EM_OS"],
  CONVERTIDO_EM_OS: ["CONCLUIDO"],
  CANCELADO: [],
  REAGENDADO: [],
  NAO_COMPARECEU: [],
  CONCLUIDO: [],
};

/** Status que ocupam a vaga (espelha o WHERE da constraint appointments_no_overlap). */
export const ACTIVE_STATUSES: readonly AppointmentStatus[] = ["PENDENTE", "CONFIRMADO", "CONVERTIDO_EM_OS"];

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isActiveStatus(status: AppointmentStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}
