import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type DbHandle } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { createSession, validateSession } from "@/lib/session-core";
import {
  changeOwnPassword,
  createStaffUser,
  listStaffUsers,
  resetStaffPassword,
  updateStaffUser,
} from "@/modules/staff/staff";

const handles: DbHandle[] = [];
afterEach(async () => {
  while (handles.length) await handles.pop()!.close();
});

async function setup() {
  const handle = await createDb("pglite://memory");
  handles.push(handle);
  await handle.migrate("./drizzle");
  const { db } = handle;
  const admin = await createStaffUser(db, { name: "Admin Um", email: "ADMIN@Example.com", role: "ADMINISTRADOR", password: "SenhaForte123" });
  if (!admin.ok) throw new Error("setup");
  return { db, adminId: admin.value.id };
}

describe("criar funcionário", () => {
  it("cria com e-mail em minúsculas e senha com hash Argon2id", async () => {
    const { db, adminId } = await setup();
    const [row] = await db.select().from(users).where(eq(users.id, adminId));
    expect(row!.email).toBe("admin@example.com");
    expect(row!.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(row!.passwordHash).not.toContain("SenhaForte123");
  });
  it("rejeita e-mail duplicado, senha fraca, e-mail inválido e perfil CLIENTE", async () => {
    const { db } = await setup();
    const base = { name: "Func Dois", email: "func@example.com", role: "FUNCIONARIO" as const, password: "OutraSenha123" };
    expect((await createStaffUser(db, { ...base, email: "admin@example.com" })).ok).toBe(false);
    expect((await createStaffUser(db, { ...base, password: "curta" })).ok).toBe(false);
    expect((await createStaffUser(db, { ...base, email: "sem-arroba" })).ok).toBe(false);
    expect((await createStaffUser(db, { ...base, role: "CLIENTE" as never })).ok).toBe(false);
    expect((await createStaffUser(db, base)).ok).toBe(true);
    expect(await listStaffUsers(db)).toHaveLength(2);
  });
});

describe("editar funcionário", () => {
  it("muda perfil e desativa, encerrando as sessões", async () => {
    const { db, adminId } = await setup();
    const f = await createStaffUser(db, { name: "Func", email: "f@example.com", role: "FUNCIONARIO", password: "SenhaForte123" });
    if (!f.ok) throw new Error("setup");
    const { token } = await createSession(db, f.value.id);
    expect(await validateSession(db, token)).not.toBeNull();
    expect((await updateStaffUser(db, adminId, f.value.id, { name: "Func", role: "ATENDENTE", active: true })).ok).toBe(true);
    expect(await validateSession(db, token)).toBeNull(); // sessão encerrada ao mudar de perfil
    const t2 = (await createSession(db, f.value.id)).token;
    expect((await updateStaffUser(db, adminId, f.value.id, { name: "Func", role: "ATENDENTE", active: false })).ok).toBe(true);
    expect(await validateSession(db, t2)).toBeNull();
  });
  it("não deixa o administrador se desativar ou rebaixar", async () => {
    const { db, adminId } = await setup();
    expect((await updateStaffUser(db, adminId, adminId, { name: "Admin Um", role: "ADMINISTRADOR", active: false })).ok).toBe(false);
    expect((await updateStaffUser(db, adminId, adminId, { name: "Admin Um", role: "FUNCIONARIO", active: true })).ok).toBe(false);
  });
  it("não deixa o sistema ficar sem administrador ativo", async () => {
    const { db, adminId } = await setup();
    const a2 = await createStaffUser(db, { name: "Admin Dois", email: "a2@example.com", role: "ADMINISTRADOR", password: "SenhaForte123" });
    if (!a2.ok) throw new Error("setup");
    // com dois admins, o primeiro pode rebaixar o segundo
    expect((await updateStaffUser(db, adminId, a2.value.id, { name: "Admin Dois", role: "FUNCIONARIO", active: true })).ok).toBe(true);
    // agora só resta um: o segundo (já rebaixado) não pode ser tratado como admin; e ninguém pode remover o último
    const a3 = await createStaffUser(db, { name: "Admin Tres", email: "a3@example.com", role: "ADMINISTRADOR", password: "SenhaForte123" });
    if (!a3.ok) throw new Error("setup");
    await db.update(users).set({ active: false }).where(eq(users.id, adminId)); // simula só a3 ativo
    expect((await updateStaffUser(db, a2.value.id, a3.value.id, { name: "Admin Tres", role: "ADMINISTRADOR", active: false })).ok).toBe(false);
  });
  it("valida nome e não edita usuário inexistente", async () => {
    const { db, adminId } = await setup();
    expect((await updateStaffUser(db, adminId, "00000000-0000-0000-0000-000000000000", { name: "Xx", role: "FUNCIONARIO", active: true })).ok).toBe(false);
    expect((await updateStaffUser(db, adminId, adminId, { name: "A", role: "ADMINISTRADOR", active: true })).ok).toBe(false);
  });
  it("não altera contas de cliente", async () => {
    const { db, adminId } = await setup();
    const [c] = await db.insert(users).values({ name: "Cli", email: "c@example.com", passwordHash: "x", role: "CLIENTE" }).returning();
    expect((await updateStaffUser(db, adminId, c!.id, { name: "Cli", role: "FUNCIONARIO", active: true })).ok).toBe(false);
    expect((await resetStaffPassword(db, c!.id, "SenhaForte123")).ok).toBe(false);
  });
});

describe("senhas", () => {
  it("administrador redefine a senha e as sessões antigas caem", async () => {
    const { db, adminId } = await setup();
    const { token } = await createSession(db, adminId);
    expect((await resetStaffPassword(db, adminId, "novaSenha12345")).ok).toBe(true);
    expect(await validateSession(db, token)).toBeNull();
    const [row] = await db.select().from(users).where(eq(users.id, adminId));
    expect(await verifyPassword(row!.passwordHash, "novaSenha12345")).toBe(true);
    expect((await resetStaffPassword(db, adminId, "fraca")).ok).toBe(false);
  });
  it("troca da própria senha exige a senha atual e mantém só a sessão atual", async () => {
    const { db, adminId } = await setup();
    const keep = await createSession(db, adminId);
    const other = await createSession(db, adminId);
    expect((await changeOwnPassword(db, adminId, "errada12345", "NovaSenha12345", keep.token)).ok).toBe(false);
    expect((await changeOwnPassword(db, adminId, "SenhaForte123", "SenhaForte123", keep.token)).ok).toBe(false);
    expect((await changeOwnPassword(db, adminId, "SenhaForte123", "curta", keep.token)).ok).toBe(false);
    expect((await changeOwnPassword(db, adminId, "SenhaForte123", "NovaSenha12345", keep.token)).ok).toBe(true);
    expect(await validateSession(db, keep.token)).not.toBeNull();
    expect(await validateSession(db, other.token)).toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.userId, adminId))).toHaveLength(1);
  });
});
