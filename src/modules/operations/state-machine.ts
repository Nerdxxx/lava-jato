export const WORK_ORDER_STATUSES = [
  "AGUARDANDO_RECEPCAO",
  "RECEBIDO",
  "NA_FILA",
  "EM_LAVAGEM",
  "EM_FINALIZACAO",
  "AGUARDANDO_INSPECAO",
  "PRONTO_PARA_ENTREGA",
  "ENTREGUE",
  "CANCELADO",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

const TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  AGUARDANDO_RECEPCAO: ["RECEBIDO", "CANCELADO"],
  RECEBIDO: ["NA_FILA", "EM_LAVAGEM", "CANCELADO"],
  NA_FILA: ["EM_LAVAGEM", "CANCELADO"],
  EM_LAVAGEM: ["EM_FINALIZACAO", "CANCELADO"],
  EM_FINALIZACAO: ["AGUARDANDO_INSPECAO", "EM_LAVAGEM", "CANCELADO"],
  // Inspeção reprovada volta para a lavagem (retrabalho).
  AGUARDANDO_INSPECAO: ["PRONTO_PARA_ENTREGA", "EM_LAVAGEM", "CANCELADO"],
  PRONTO_PARA_ENTREGA: ["ENTREGUE", "AGUARDANDO_INSPECAO", "CANCELADO"],
  ENTREGUE: [],
  CANCELADO: [],
};

export function canTransitionWorkOrder(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: WorkOrderStatus): readonly WorkOrderStatus[] {
  return TRANSITIONS[from];
}

/** Para chegar a estes status, todos os itens do checklist precisam estar concluídos. */
export const REQUIRES_COMPLETE_CHECKLIST: readonly WorkOrderStatus[] = ["AGUARDANDO_INSPECAO", "PRONTO_PARA_ENTREGA"];

export const OPEN_STATUSES: readonly WorkOrderStatus[] = [
  "AGUARDANDO_RECEPCAO",
  "RECEBIDO",
  "NA_FILA",
  "EM_LAVAGEM",
  "EM_FINALIZACAO",
  "AGUARDANDO_INSPECAO",
  "PRONTO_PARA_ENTREGA",
];

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  AGUARDANDO_RECEPCAO: "Aguardando recepção",
  RECEBIDO: "Recebido",
  NA_FILA: "Na fila",
  EM_LAVAGEM: "Em lavagem",
  EM_FINALIZACAO: "Finalização",
  AGUARDANDO_INSPECAO: "Aguardando inspeção",
  PRONTO_PARA_ENTREGA: "Pronto para entrega",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

/** Placa parcialmente mascarada para telas operacionais: ABC1D23 → ABC••23. */
export function maskPlate(plate: string | null): string {
  if (!plate) return "sem placa";
  if (plate.length < 7) return plate;
  return `${plate.slice(0, 3)}••${plate.slice(-2)}`;
}

export function formatOsNumber(n: number): string {
  return `OS-${String(n).padStart(5, "0")}`;
}
