import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { hashToken } from "@/lib/session-core";

export const STAFF_ROLES = ["ADMINISTRADOR", "FUNCIONARIO", "ATENDENTE"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffResult<T = undefined> = { ok: true; value: T } | { ok: false; message: string };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

export async function listStaffUsers(db: Database) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, createdAt: users.createdAt })
    .from(users)
    .where(inArray(users.role, [...STAFF_ROLES]))
    .orderBy(asc(users.name));
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(254),
  role: z.enum(STAFF_ROLES),
  password: z.string(),
});

export async function createStaffUser(db: Database, raw: z.input<typeof createSchema>): Promise<StaffResult<{ id: string }>> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const { name, email, role, password } = parsed.data;
  const weak = validatePasswordStrength(password);
  if (weak) return fail(weak);
  const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (exists.length) return fail("Já existe um usuário com este e-mail.");
  const [row] = await db
    .insert(users)
    .values({ name, email, role, passwordHash: await hashPassword(password) })
    .returning({ id: users.id });
  return { ok: true, value: { id: row!.id } };
}

async function activeAdminCount(db: Database): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "ADMINISTRADOR"), eq(users.active, true)));
  return r?.n ?? 0;
}

const updateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  role: z.enum(STAFF_ROLES),
  active: z.boolean(),
});

/** Edita nome, perfil e situação. Protege contra ficar sem administrador e contra o admin se bloquear. */
export async function updateStaffUser(
  db: Database,
  actorId: string,
  targetId: string,
  raw: z.input<typeof updateSchema>,
): Promise<StaffResult> {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target || target.role === "CLIENTE") return fail("Usuário não encontrado.");

  const { name, role, active } = parsed.data;
  if (targetId === actorId && (!active || role !== "ADMINISTRADOR")) {
    return fail("Você não pode desativar nem rebaixar a própria conta.");
  }
  const losingAdmin = target.role === "ADMINISTRADOR" && target.active && (!active || role !== "ADMINISTRADOR");
  if (losingAdmin && (await activeAdminCount(db)) <= 1) return fail("É preciso manter ao menos um administrador ativo.");

  await db.transaction(async (tx) => {
    await tx.update(users).set({ name, role, active }).where(eq(users.id, targetId));
    // Perfil alterado ou conta desativada: encerra as sessões abertas.
    if (!active || role !== target.role) await tx.delete(sessions).where(eq(sessions.userId, targetId));
  });
  return { ok: true, value: undefined };
}

/** Redefinição feita por um administrador. Encerra todas as sessões do usuário. */
export async function resetStaffPassword(db: Database, targetId: string, newPassword: string): Promise<StaffResult> {
  const weak = validatePasswordStrength(newPassword);
  if (weak) return fail(weak);
  const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, targetId)).limit(1);
  if (!target || target.role === "CLIENTE") return fail("Usuário não encontrado.");
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, targetId));
    await tx.delete(sessions).where(eq(sessions.userId, targetId));
  });
  return { ok: true, value: undefined };
}

/** Troca da própria senha. Mantém só a sessão atual; as demais são encerradas. */
export async function changeOwnPassword(
  db: Database,
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentToken?: string,
): Promise<StaffResult> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return fail("Usuário não encontrado.");
  if (!(await verifyPassword(user.passwordHash, currentPassword))) return fail("A senha atual está incorreta.");
  if (currentPassword === newPassword) return fail("A nova senha deve ser diferente da atual.");
  const weak = validatePasswordStrength(newPassword);
  if (weak) return fail(weak);
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await tx
      .delete(sessions)
      .where(currentToken ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, hashToken(currentToken))) : eq(sessions.userId, userId));
  });
  return { ok: true, value: undefined };
}
