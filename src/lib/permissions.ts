export const ROLES = ["ADMINISTRADOR", "FUNCIONARIO", "ATENDENTE", "CLIENTE"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "dashboard:ver",
  "agenda:ver",
  "agenda:gerir",
  "fila:ver",
  "fila:atualizar",
  "os:ver",
  "os:gerir",
  "clientes:ver",
  "clientes:gerir",
  "veiculos:gerir",
  "servicos:gerir",
  "financeiro:ver",
  "financeiro:receber",
  "estoque:gerir",
  "funcionarios:gerir",
  "configuracoes:gerir",
  "auditoria:ver",
  "proprio:ver",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Matriz central de permissões. Ocultar botão na UI NÃO substitui esta verificação no servidor. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMINISTRADOR: PERMISSIONS.filter((p) => p !== "proprio:ver"),
  FUNCIONARIO: ["agenda:ver", "fila:ver", "fila:atualizar", "os:ver"],
  ATENDENTE: [
    "agenda:ver",
    "agenda:gerir",
    "fila:ver",
    "fila:atualizar",
    "os:ver",
    "os:gerir",
    "clientes:ver",
    "clientes:gerir",
    "veiculos:gerir",
  ],
  CLIENTE: ["proprio:ver"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isStaff(role: Role): boolean {
  return role !== "CLIENTE";
}
