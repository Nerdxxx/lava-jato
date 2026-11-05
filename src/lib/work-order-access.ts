import type { Role } from "./permissions";

/**
 * Regra de visibilidade da OS:
 * - Administrador e atendente veem todas.
 * - Funcionário vê as atribuídas a ele e as ainda sem responsável.
 * - Cliente nunca acessa pelo painel interno.
 */
export function canAccessWorkOrder(user: { id: string; role: Role }, wo: { assignedTo: string | null }): boolean {
  if (user.role === "ADMINISTRADOR" || user.role === "ATENDENTE") return true;
  if (user.role === "FUNCIONARIO") return wo.assignedTo === null || wo.assignedTo === user.id;
  return false;
}

/** Garante que a requisição veio do próprio site (defesa CSRF para POSTs fora de Server Actions). */
export function isSameOrigin(headers: { get(name: string): string | null }): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}
