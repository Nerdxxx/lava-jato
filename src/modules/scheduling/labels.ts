export const CATEGORY_LABEL: Record<string, string> = {
  MOTO: "Moto",
  CARRO_PEQUENO: "Carro pequeno",
  CARRO_MEDIO: "Carro médio",
  SUV: "SUV / Utilitário",
  PICAPE: "Picape",
};
export const CATEGORY_ORDER = ["MOTO", "CARRO_PEQUENO", "CARRO_MEDIO", "SUV", "PICAPE"] as const;

export const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Aguardando confirmação",
  CONFIRMADO: "Confirmado",
  CANCELADO: "Cancelado",
  REAGENDADO: "Reagendado",
  NAO_COMPARECEU: "Não compareceu",
  CONVERTIDO_EM_OS: "Em atendimento",
  CONCLUIDO: "Concluído",
};

export const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  PENDENTE: "warning",
  CONFIRMADO: "info",
  CANCELADO: "danger",
  REAGENDADO: "neutral",
  NAO_COMPARECEU: "danger",
  CONVERTIDO_EM_OS: "info",
  CONCLUIDO: "success",
};
