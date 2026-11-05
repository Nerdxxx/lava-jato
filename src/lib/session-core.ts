import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Database } from "@/db/client";
import { loginAttempts, sessions, users } from "@/db/schema";
import type { Role } from "./permissions";

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 dias
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 1000 * 60 * 15;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(db: Database, userId: string, userAgent?: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: userAgent?.slice(0, 255),
  });
  return { token, expiresAt };
}

/** Retorna o usuário da sessão, ou null se inválida/expirada/usuário inativo. */
export async function validateSession(db: Database, token: string): Promise<SessionUser | null> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || !row.active) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function destroySession(db: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function isRateLimited(db: Database, key: string): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const rows = await db
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.attemptedAt, since)));
  return rows.length >= LOGIN_MAX_ATTEMPTS;
}

export async function recordFailedAttempt(db: Database, key: string): Promise<void> {
  await db.insert(loginAttempts).values({ key });
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, new Date(Date.now() - LOGIN_WINDOW_MS * 4)));
}

export async function clearAttempts(db: Database, key: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}
