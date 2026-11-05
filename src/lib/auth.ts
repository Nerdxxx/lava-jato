import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { hasPermission, isStaff, type Permission } from "./permissions";
import { destroySession, validateSession, type SessionUser } from "./session-core";

export const SESSION_COOKIE = "ljc_session";

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSession(await getDb(), token);
});

/** Exige usuário da equipe com a permissão informada; redireciona ao login se não autenticado. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  if (!hasPermission(user.role, permission)) redirect("/acesso-negado");
  return user;
}

export async function requireStaff(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  if (!isStaff(user.role)) redirect("/cliente");
  return user;
}

export async function requireCustomer(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/cliente");
  if (user.role !== "CLIENTE") redirect("/admin");
  return user;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(await getDb(), token);
  store.delete(SESSION_COOKIE);
}
