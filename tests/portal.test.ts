import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type DbHandle } from "@/db/client";
import { appointments, customers, resources, servicePrices, services, sessions, users, workOrderPhotos } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session-core";
import { loadProfile, saveProfile } from "@/modules/business/profile";
import {
  checkResetToken,
  createPortalAccess,
  createResetToken,
  customerOwnsPhoto,
  getPortalData,
  registerCustomerAccount,
  resetPasswordWithToken,
  updateOwnProfile,
} from "@/modules/customers/portal";
import { buildWorkOrderMessage, waLink } from "@/modules/notifications/whatsapp";
import { createWalkInWorkOrder } from "@/modules/operations/work-orders";

const handles: DbHandle[] = [];
afterEach(async () => {
  while (handles.length) await handles.pop()!.close();
});

const PASS = "senhaForte123";

async function setup() {
  const handle = await createDb("pglite://memory");
  handles.push(handle);
  await handle.migrate("./drizzle");
  const { db } = handle;
  await db.insert(resources).values({ name: "Vaga 1" });
  const [svc] = await db.insert(services).values({ slug: "externa", name: "Lavagem externa", durationMinutes: 40 }).returning();
  await db.insert(servicePrices).values({ serviceId: svc!.id, category: "CARRO_PEQUENO", priceCents: 4000 });
  const [staff] = await db.insert(users).values({ name: "Atendente", email: "at@example.com", passwordHash: "x", role: "ATENDENTE" }).returning();
  const walkIn = async (phone: string, name = "Maria Souza") => {
    const r = await createWalkInWorkOrder(db, { name, phone, category: "CARRO_PEQUENO", serviceId: svc!.id, vehicleModel: "Onix" }, staff!.id);
    if (!r.ok) throw new Error(r.message);
    return r.value;
  };
  return { db, svc: svc!, staff: staff!, walkIn };
}

describe("cadastro do cliente", () => {
  it("cria conta nova com cliente vinculado e valida dados", async () => {
    const { db } = await setup();
    expect((await registerCustomerAccount(db, { name: "Ana", phone: "123", email: "ana@example.com", password: PASS })).ok).toBe(false);
    expect((await registerCustomerAccount(db, { name: "Ana", phone: "79999990001", email: "ana@example.com", password: "curta" })).ok).toBe(false);
    const r = await registerCustomerAccount(db, { name: "Ana", phone: "(79) 99999-0001", email: "ANA@example.com", password: PASS, marketingConsent: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [u] = await db.select().from(users).where(eq(users.id, r.value.userId));
    expect(u!.role).toBe("CLIENTE");
    expect(u!.email).toBe("ana@example.com");
    const [c] = await db.select().from(customers).where(eq(customers.userId, r.value.userId));
    expect(c!.phone).toBe("79999990001");
    expect(c!.marketingConsent).toBe(true);
    // e-mail e WhatsApp não podem ser reutilizados
    expect((await registerCustomerAccount(db, { name: "X", phone: "79999990002", email: "ana@example.com", password: PASS })).ok).toBe(false);
    expect((await registerCustomerAccount(db, { name: "X", phone: "79999990001", email: "x@example.com", password: PASS })).ok).toBe(false);
  });

  it("só vincula cliente existente com o código de um agendamento dele", async () => {
    const { db, svc, walkIn } = await setup();
    const wo = await walkIn("79999990010");
    const other = await walkIn("79999990011", "Outro");
    const [res] = await db.select().from(resources);
    const mk = (customerId: string, code: string, hour: number) =>
      db.insert(appointments).values({
        code,
        customerId,
        serviceId: svc.id,
        resourceId: res!.id,
        category: "CARRO_PEQUENO",
        vehicleModel: "Onix",
        startsAt: new Date(Date.UTC(2030, 0, 7, hour, 0)),
        endsAt: new Date(Date.UTC(2030, 0, 7, hour, 40)),
        priceCents: 4000,
      });
    await mk(wo.customerId, "CODIGO01", 12);
    await mk(other.customerId, "CODIGO02", 14);

    const base = { name: "Maria", phone: "79999990010", email: "maria@example.com", password: PASS };
    expect((await registerCustomerAccount(db, base)).ok).toBe(false); // sem código
    expect((await registerCustomerAccount(db, { ...base, appointmentCode: "CODIGO02" })).ok).toBe(false); // código de outro cliente
    const ok = await registerCustomerAccount(db, { ...base, appointmentCode: "codigo01" });
    expect(ok.ok).toBe(true);
    const [c] = await db.select().from(customers).where(eq(customers.id, wo.customerId));
    expect(c!.userId).toBe(ok.ok ? ok.value.userId : null);
  });
});

describe("link de acesso / redefinição de senha", () => {
  it("é de uso único, invalida links anteriores e encerra sessões", async () => {
    const { db, staff, walkIn } = await setup();
    const wo = await walkIn("79999990020");
    const access = await createPortalAccess(db, wo.customerId, "cliente@example.com", staff.id);
    expect(access.ok).toBe(true);
    if (!access.ok) return;
    const [c] = await db.select().from(customers).where(eq(customers.id, wo.customerId));
    expect(c!.userId).not.toBeNull();
    const userId = c!.userId!;
    await createSession(db, userId);

    const second = await createResetToken(db, userId, staff.id);
    expect(await checkResetToken(db, access.value.token)).toBeNull(); // anterior invalidado
    expect((await resetPasswordWithToken(db, second, "fraca")).ok).toBe(false);
    expect((await resetPasswordWithToken(db, second, PASS)).ok).toBe(true);
    expect((await resetPasswordWithToken(db, second, PASS)).ok).toBe(false); // uso único
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(await verifyPassword(u!.passwordHash, PASS)).toBe(true);
    expect((await db.select().from(sessions).where(eq(sessions.userId, userId))).length).toBe(0);

    // cliente já com conta: gera novo link sem criar outro usuário
    const again = await createPortalAccess(db, wo.customerId, "", staff.id);
    expect(again.ok).toBe(true);
    expect((await db.select().from(users).where(eq(users.role, "CLIENTE"))).length).toBe(1);
  });

  it("expira após o prazo", async () => {
    const { db, staff, walkIn } = await setup();
    const wo = await walkIn("79999990030");
    const r = await createPortalAccess(db, wo.customerId, "c30@example.com", staff.id);
    if (!r.ok) throw new Error(r.message);
    const later = new Date(Date.now() + 49 * 60 * 60 * 1000);
    expect(await checkResetToken(db, r.value.token, later)).toBeNull();
    expect((await resetPasswordWithToken(db, r.value.token, PASS, later)).ok).toBe(false);
  });

  it("não cria acesso com e-mail já usado", async () => {
    const { db, staff, walkIn } = await setup();
    const wo = await walkIn("79999990040");
    expect((await createPortalAccess(db, wo.customerId, "at@example.com", staff.id)).ok).toBe(false);
    expect((await createPortalAccess(db, wo.customerId, "invalido", staff.id)).ok).toBe(false);
  });
});

describe("portal: dados e fotos só do próprio cliente", () => {
  it("lista OS do cliente e restringe fotos", async () => {
    const { db, staff, walkIn } = await setup();
    const mine = await walkIn("79999990050");
    const theirs = await walkIn("79999990051", "Outra pessoa");
    const [p1] = await db
      .insert(workOrderPhotos)
      .values({ workOrderId: mine.id, kind: "DEPOIS", storagePath: "os/x/a.webp", mimeType: "image/webp", sizeBytes: 1, uploadedBy: staff.id })
      .returning();
    const [p2] = await db
      .insert(workOrderPhotos)
      .values({ workOrderId: theirs.id, kind: "DEPOIS", storagePath: "os/y/b.webp", mimeType: "image/webp", sizeBytes: 1, uploadedBy: staff.id })
      .returning();
    expect(await customerOwnsPhoto(db, mine.customerId, p1!.id)).toBe(true);
    expect(await customerOwnsPhoto(db, mine.customerId, p2!.id)).toBe(false);
    const data = await getPortalData(db, mine.customerId);
    expect(data.active.map((w) => w.id)).toEqual([mine.id]);
    expect(data.photos.map((p) => p.id)).toEqual([p1!.id]);
  });

  it("cliente atualiza nome e consentimento", async () => {
    const { db } = await setup();
    const r = await registerCustomerAccount(db, { name: "Ana", phone: "79999990060", email: "a60@example.com", password: PASS });
    if (!r.ok) throw new Error(r.message);
    expect((await updateOwnProfile(db, r.value.userId, { name: "Ana Lima", marketingConsent: true })).ok).toBe(true);
    const [c] = await db.select().from(customers).where(eq(customers.userId, r.value.userId));
    expect(c!.name).toBe("Ana Lima");
    expect(c!.marketingConsent).toBe(true);
  });
});

describe("perfil do negócio e WhatsApp", () => {
  it("valida e salva o perfil, e monta mensagens", async () => {
    const { db, walkIn } = await setup();
    expect((await loadProfile(db)).name).toBe("Lava Jato Capuã");
    expect((await saveProfile(db, { name: "LJC", whatsapp: "123", address: "", mapsUrl: "", instagram: "", pixKey: "" })).ok).toBe(false);
    expect((await saveProfile(db, { name: "LJC", whatsapp: "", address: "", mapsUrl: "http://x", instagram: "", pixKey: "" })).ok).toBe(false);
    const saved = await saveProfile(db, { name: "LJC", whatsapp: "(79) 99999-1234", address: "Capuã", mapsUrl: "", instagram: "@lavajato.capua", pixKey: "" });
    expect(saved.ok && saved.value.whatsapp).toBe("79999991234");
    expect(saved.ok && saved.value.instagram).toBe("lavajato.capua");

    expect(waLink("79999991234", "Olá & até")).toBe("https://wa.me/5579999991234?text=Ol%C3%A1%20%26%20at%C3%A9");
    const wo = await walkIn("79999990070", "João Pedro");
    const msg = await buildWorkOrderMessage(db, wo.id, "OS_PRONTA", "LJC", "https://ljc.example");
    expect(msg?.text).toContain("Olá, João!");
    expect(msg?.text).toContain("R$");
    expect(msg?.phone).toBe("79999990070");
  });
});
