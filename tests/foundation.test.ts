import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "@/db/client";
import { appointments, customers, resources, services, users } from "@/db/schema";
import { hasPermission } from "@/lib/permissions";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import {
  createSession,
  destroySession,
  isRateLimited,
  recordFailedAttempt,
  validateSession,
} from "@/lib/session-core";
import { eq } from "drizzle-orm";

let handle: DbHandle;

beforeAll(async () => {
  handle = await createDb("pglite://memory");
  await handle.migrate("./drizzle");
});
afterAll(async () => {
  await handle.close();
});

describe("permissões", () => {
  it("cliente não acessa financeiro nem agenda administrativa", () => {
    expect(hasPermission("CLIENTE", "financeiro:ver")).toBe(false);
    expect(hasPermission("CLIENTE", "agenda:ver")).toBe(false);
  });
  it("funcionário não acessa financeiro", () => {
    expect(hasPermission("FUNCIONARIO", "financeiro:ver")).toBe(false);
    expect(hasPermission("FUNCIONARIO", "fila:atualizar")).toBe(true);
  });
  it("administrador acessa tudo da equipe", () => {
    expect(hasPermission("ADMINISTRADOR", "financeiro:ver")).toBe(true);
    expect(hasPermission("ADMINISTRADOR", "auditoria:ver")).toBe(true);
  });
});

describe("senha", () => {
  it("gera hash Argon2id e verifica", async () => {
    const h = await hashPassword("senhaSegura123");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "senhaSegura123")).toBe(true);
    expect(await verifyPassword(h, "outraSenha123")).toBe(false);
  });
  it("rejeita senhas fracas", () => {
    expect(validatePasswordStrength("curta1")).not.toBeNull();
    expect(validatePasswordStrength("somenteletrasaqui")).not.toBeNull();
    expect(validatePasswordStrength("senhaSegura123")).toBeNull();
  });
});

describe("sessões", () => {
  it("cria, valida e destrói sessão; usuário inativo é rejeitado", async () => {
    const { db } = handle;
    const [u] = await db
      .insert(users)
      .values({ name: "Teste", email: "t@example.com", passwordHash: "x", role: "ATENDENTE" })
      .returning();
    const { token } = await createSession(db, u!.id);
    expect((await validateSession(db, token))?.email).toBe("t@example.com");
    await db.update(users).set({ active: false }).where(eq(users.id, u!.id));
    expect(await validateSession(db, token)).toBeNull();
    await db.update(users).set({ active: true }).where(eq(users.id, u!.id));
    await destroySession(db, token);
    expect(await validateSession(db, token)).toBeNull();
  });
  it("limita tentativas de login", async () => {
    const { db } = handle;
    for (let i = 0; i < 5; i++) await recordFailedAttempt(db, "a@b.com|1.1.1.1");
    expect(await isRateLimited(db, "a@b.com|1.1.1.1")).toBe(true);
    expect(await isRateLimited(db, "outro@b.com|1.1.1.1")).toBe(false);
  });
});

describe("agenda: constraint anti-sobreposição", () => {
  it("rejeita a segunda reserva no mesmo horário/vaga e aceita após cancelamento", async () => {
    const { db } = handle;
    const [res] = await db.insert(resources).values({ name: "Vaga 1" }).returning();
    const [svc] = await db
      .insert(services)
      .values({ slug: "externa", name: "Lavagem externa", durationMinutes: 40 })
      .returning();
    const [cus] = await db.insert(customers).values({ name: "Cliente", phone: "79999990000" }).returning();
    const base = {
      customerId: cus!.id,
      serviceId: svc!.id,
      resourceId: res!.id,
      category: "CARRO_PEQUENO" as const,
      vehicleModel: "Carro",
      startsAt: new Date("2030-01-07T12:00:00Z"),
      endsAt: new Date("2030-01-07T12:40:00Z"),
      priceCents: 4000,
    };
    const [first] = await db.insert(appointments).values({ ...base, code: "AAA111" }).returning();
    await expect(db.insert(appointments).values({ ...base, code: "BBB222" })).rejects.toThrow();
    // adjacente (começa quando o outro termina) é permitido
    await db.insert(appointments).values({
      ...base,
      code: "CCC333",
      startsAt: new Date("2030-01-07T12:40:00Z"),
      endsAt: new Date("2030-01-07T13:20:00Z"),
    });
    // cancelado libera a vaga
    await db.update(appointments).set({ status: "CANCELADO" }).where(eq(appointments.id, first!.id));
    await db.insert(appointments).values({ ...base, code: "DDD444" });
  });
});
