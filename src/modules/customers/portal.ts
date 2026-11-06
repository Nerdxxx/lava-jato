import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNull, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  appointments,
  customers,
  passwordResetTokens,
  services,
  sessions,
  users,
  vehicles,
  workOrderPhotos,
  workOrders,
} from "@/db/schema";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";
import { hashToken } from "@/lib/session-core";

export type OpResult<T> = { ok: true; value: T } | { ok: false; message: string };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

export const RESET_TTL_MS = 1000 * 60 * 60 * 48; // 48 h
export const PORTAL_LINK_COOKIE = "ljc_portal_link";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(120),
  phone: z.string().trim().min(8, "Informe seu WhatsApp."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254),
  password: z.string().max(128),
  appointmentCode: z.string().trim().toUpperCase().max(12).optional(),
  marketingConsent: z.boolean().default(false),
});

/**
 * Cadastro do cliente no portal.
 * Se o WhatsApp já existe (cliente atendido antes), só vincula com prova de posse:
 * o código de um agendamento desse cliente. Sem o código, a equipe pode gerar um link de acesso.
 */
export async function registerCustomerAccount(db: Database, raw: z.input<typeof registerSchema>): Promise<OpResult<{ userId: string }>> {
  const p = registerSchema.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dados inválidos.");
  const input = p.data;
  const phone = normalizePhone(input.phone);
  if (!phone) return fail("Informe um WhatsApp válido com DDD.");
  const weak = validatePasswordStrength(input.password);
  if (weak) return fail(weak);

  const [emailTaken] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (emailTaken) return fail("Este e-mail já tem cadastro. Entre com sua senha ou use “Esqueci minha senha”.");

  const [existing] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  if (existing?.userId) return fail("Este WhatsApp já tem uma conta. Entre com seu e-mail e senha.");
  if (existing) {
    if (!input.appointmentCode) {
      return fail("Já temos um cadastro com este WhatsApp. Informe o código de um agendamento seu ou peça ao lava jato um link de acesso.");
    }
    const [appt] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq(appointments.code, input.appointmentCode), eq(appointments.customerId, existing.id)))
      .limit(1);
    if (!appt) return fail("Código de agendamento não confere com este WhatsApp.");
  }

  const passwordHash = await hashPassword(input.password);
  try {
    const userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ name: input.name, email: input.email, passwordHash, role: "CLIENTE" })
        .returning({ id: users.id });
      if (existing) {
        const linked = await tx
          .update(customers)
          .set({ userId: user!.id, email: input.email, marketingConsent: input.marketingConsent || existing.marketingConsent })
          .where(and(eq(customers.id, existing.id), isNull(customers.userId)))
          .returning({ id: customers.id });
        if (!linked.length) throw new Error("LINKED");
      } else {
        await tx.insert(customers).values({ name: input.name, phone, email: input.email, userId: user!.id, marketingConsent: input.marketingConsent });
      }
      return user!.id;
    });
    return { ok: true, value: { userId } };
  } catch (e) {
    if (e instanceof Error && e.message === "LINKED") return fail("Este WhatsApp já tem uma conta. Entre com seu e-mail e senha.");
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") return fail("Este e-mail ou WhatsApp já tem cadastro.");
    throw e;
  }
}

/** Gera um link de redefinição/primeiro acesso (uso único). Tokens anteriores não usados são invalidados. */
export async function createResetToken(db: Database, userId: string, createdBy: string | null, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
    await tx.insert(passwordResetTokens).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + RESET_TTL_MS),
      createdBy,
    });
  });
  return token;
}

export async function checkResetToken(db: Database, token: string, now = new Date()) {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const [row] = await db
    .select({ t: passwordResetTokens, name: users.name, email: users.email, active: users.active })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(and(eq(passwordResetTokens.tokenHash, hashToken(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, now)))
    .limit(1);
  return row && row.active ? row : null;
}

/** Define a nova senha a partir do link; encerra todas as sessões do usuário. */
export async function resetPasswordWithToken(db: Database, token: string, newPassword: string, now = new Date()): Promise<OpResult<{ userId: string }>> {
  const weak = validatePasswordStrength(newPassword);
  if (weak) return fail(weak);
  const row = await checkResetToken(db, token, now);
  if (!row) return fail("Link inválido ou expirado. Peça um novo link ao lava jato.");
  const passwordHash = await hashPassword(newPassword);
  const ok = await db.transaction(async (tx) => {
    const used = await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.id, row.t.id), isNull(passwordResetTokens.usedAt)))
      .returning({ id: passwordResetTokens.id });
    if (!used.length) return false;
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.t.userId));
    await tx.delete(sessions).where(eq(sessions.userId, row.t.userId));
    return true;
  });
  return ok ? { ok: true, value: { userId: row.t.userId } } : fail("Link já utilizado.");
}

/**
 * A equipe cria o acesso ao portal para um cliente já cadastrado (sem conta).
 * A senha inicial é aleatória e descartada; o cliente define a sua pelo link gerado.
 */
export async function createPortalAccess(db: Database, customerId: string, rawEmail: string, staffId: string): Promise<OpResult<{ token: string }>> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return fail("Cliente não encontrado.");
  if (customer.userId) {
    const token = await createResetToken(db, customer.userId, staffId);
    return { ok: true, value: { token } };
  }
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(rawEmail);
  if (!email.success) return fail("Informe um e-mail válido para o cliente.");
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.data)).limit(1);
  if (taken) return fail("Este e-mail já está em uso por outra conta.");
  const passwordHash = await hashPassword(randomBytes(24).toString("base64url"));
  const userId = await db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ name: customer.name, email: email.data, passwordHash, role: "CLIENTE" }).returning({ id: users.id });
    const linked = await tx
      .update(customers)
      .set({ userId: u!.id, email: email.data })
      .where(and(eq(customers.id, customerId), isNull(customers.userId)))
      .returning({ id: customers.id });
    if (!linked.length) throw new Error("Cliente já vinculado a outra conta.");
    return u!.id;
  });
  return { ok: true, value: { token: await createResetToken(db, userId, staffId) } };
}

export async function getCustomerForUser(db: Database, userId: string) {
  const [c] = await db.select().from(customers).where(eq(customers.userId, userId)).limit(1);
  return c ?? null;
}

const CLOSED_WO = ["ENTREGUE", "CANCELADO"] as const;

/** Tudo o que o cliente vê no portal — sempre filtrado pelo customerId da sessão. */
export async function getPortalData(db: Database, customerId: string, now = new Date()) {
  const [vehicleRows, upcoming, active, history] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.customerId, customerId)).orderBy(desc(vehicles.createdAt)),
    db
      .select({ a: appointments, serviceName: services.name })
      .from(appointments)
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .where(and(eq(appointments.customerId, customerId), inArray(appointments.status, ["PENDENTE", "CONFIRMADO"]), gte(appointments.endsAt, now)))
      .orderBy(asc(appointments.startsAt)),
    db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.customerId, customerId), notInArray(workOrders.status, [...CLOSED_WO])))
      .orderBy(desc(workOrders.receivedAt)),
    db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.customerId, customerId), inArray(workOrders.status, [...CLOSED_WO])))
      .orderBy(desc(workOrders.receivedAt))
      .limit(20),
  ]);
  const woIds = [...active, ...history].map((w) => w.id);
  const photos = woIds.length
    ? await db
        .select({ id: workOrderPhotos.id, workOrderId: workOrderPhotos.workOrderId, kind: workOrderPhotos.kind })
        .from(workOrderPhotos)
        .where(inArray(workOrderPhotos.workOrderId, woIds))
        .orderBy(asc(workOrderPhotos.createdAt))
    : [];
  return { vehicles: vehicleRows, upcoming, active, history, photos };
}

/** O cliente só acessa fotos das próprias OS. */
export async function customerOwnsPhoto(db: Database, customerId: string, photoId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workOrderPhotos.id })
    .from(workOrderPhotos)
    .innerJoin(workOrders, eq(workOrders.id, workOrderPhotos.workOrderId))
    .where(and(eq(workOrderPhotos.id, photoId), eq(workOrders.customerId, customerId)))
    .limit(1);
  return !!row;
}

const profileSchema = z.object({ name: z.string().trim().min(2, "Informe seu nome.").max(120), marketingConsent: z.boolean() });

export async function updateOwnProfile(db: Database, userId: string, raw: z.input<typeof profileSchema>): Promise<OpResult<undefined>> {
  const p = profileSchema.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dados inválidos.");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ name: p.data.name }).where(eq(users.id, userId));
    await tx.update(customers).set({ name: p.data.name, marketingConsent: p.data.marketingConsent }).where(eq(customers.userId, userId));
  });
  return { ok: true, value: undefined };
}
