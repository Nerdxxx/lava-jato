import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "@/db/client";
import { customers, servicePrices, services, users, vehicles, workOrderPhotos } from "@/db/schema";
import { addVehicle, getCustomer360, searchCustomers, updateCustomer } from "@/modules/customers/customers";
import { createWalkInWorkOrder } from "@/modules/operations/work-orders";
import { detectImageType, loadPhoto, MAX_UPLOAD_BYTES, storePhoto } from "@/modules/operations/photos";

const handles: DbHandle[] = [];
let storageDir: string;
beforeAll(async () => {
  storageDir = await mkdtemp(path.join(os.tmpdir(), "ljc-photos-"));
});
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});
afterEach(async () => {
  while (handles.length) await handles.pop()!.close();
});

async function setup() {
  const handle = await createDb("pglite://memory");
  handles.push(handle);
  await handle.migrate("./drizzle");
  const { db } = handle;
  const [svc] = await db.insert(services).values({ slug: "externa", name: "Externa", durationMinutes: 40 }).returning();
  await db.insert(servicePrices).values({ serviceId: svc!.id, category: "CARRO_PEQUENO", priceCents: 4000 });
  const [staff] = await db
    .insert(users)
    .values({ name: "Equipe", email: "e@example.com", passwordHash: "x", role: "ADMINISTRADOR" })
    .returning();
  const wo = await createWalkInWorkOrder(
    db,
    { name: "Maria Silva", phone: "79999000003", category: "CARRO_PEQUENO", serviceId: svc!.id, vehicleModel: "Polo", plate: "ABC1D23" },
    staff!.id,
  );
  if (!wo.ok) throw new Error("setup");
  return { db, svc: svc!, staff: staff!, wo: wo.value };
}

const png = (w = 2400, h = 1200) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer();

describe("fotos", () => {
  it("detecta formatos pelo conteúdo", async () => {
    expect(detectImageType(await png(10, 10))).toBe("png");
    expect(detectImageType(await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).jpeg().toBuffer())).toBe("jpeg");
    expect(detectImageType(Buffer.from("<?php echo 1; ?> not an image at all"))).toBeNull();
  });

  it("grava foto redimensionada em WebP, em armazenamento privado, e consegue ler de volta", async () => {
    const { db, wo, staff } = await setup();
    const r = await storePhoto(db, { workOrderId: wo.id, kind: "ANTES", bytes: await png(), userId: staff.id, storageDir });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const loaded = await loadPhoto(db, r.value.id, storageDir);
    expect(loaded?.row.mimeType).toBe("image/webp");
    const meta = await sharp(loaded!.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1600);
    expect(loaded!.row.storagePath.startsWith("os/")).toBe(true);
  });

  it("rejeita formato inválido, arquivo vazio, tipo inválido e arquivo grande demais", async () => {
    const { db, wo, staff } = await setup();
    const base = { workOrderId: wo.id, userId: staff.id, storageDir };
    expect((await storePhoto(db, { ...base, kind: "ANTES", bytes: Buffer.from("GIF89a-not-allowed-here") })).ok).toBe(false);
    expect((await storePhoto(db, { ...base, kind: "ANTES", bytes: Buffer.alloc(0) })).ok).toBe(false);
    expect((await storePhoto(db, { ...base, kind: "OUTRO", bytes: await png(50, 50) })).ok).toBe(false);
    const big = Buffer.concat([await png(50, 50), Buffer.alloc(MAX_UPLOAD_BYTES)]);
    expect((await storePhoto(db, { ...base, kind: "ANTES", bytes: big })).ok).toBe(false);
    expect(await db.select().from(workOrderPhotos)).toHaveLength(0);
  });

  it("não aceita OS inexistente nem lê caminho fora do armazenamento", async () => {
    const { db, wo, staff } = await setup();
    expect((await storePhoto(db, { workOrderId: "00000000-0000-0000-0000-000000000000", kind: "ANTES", bytes: await png(50, 50), userId: staff.id, storageDir })).ok).toBe(false);
    const r = await storePhoto(db, { workOrderId: wo.id, kind: "DEPOIS", bytes: await png(50, 50), userId: staff.id, storageDir });
    if (!r.ok) throw new Error("setup");
    await db.update(workOrderPhotos).set({ storagePath: "../../etc/passwd" });
    expect(await loadPhoto(db, r.value.id, storageDir)).toBeNull();
    expect(await readFile(path.join(storageDir, "os", wo.id)).catch(() => "dir")).toBe("dir");
  });
});

describe("clientes e veículos", () => {
  it("busca por nome, telefone, placa e modelo", async () => {
    const { db } = await setup();
    const ids = async (q: string) => (await searchCustomers(db, q)).map((c) => c.name);
    expect(await ids("maria")).toEqual(["Maria Silva"]);
    expect(await ids("99900")).toEqual(["Maria Silva"]);
    expect(await ids("abc-1d23")).toEqual(["Maria Silva"]);
    expect(await ids("polo")).toEqual(["Maria Silva"]);
    expect(await ids("zzzz")).toEqual([]);
    expect(await ids("")).toEqual(["Maria Silva"]);
    expect(await ids("%")).toEqual([]); // curinga não vaza tudo
  });

  it("perfil 360 reúne veículos, OS e total gasto só de OS entregues", async () => {
    const { db, wo } = await setup();
    const view = await getCustomer360(db, wo.customerId);
    expect(view?.vehicles).toHaveLength(1);
    expect(view?.workOrders).toHaveLength(1);
    expect(view?.totalSpentCents).toBe(0);
    expect(await getCustomer360(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("cadastra veículo, bloqueia placa duplicada e normaliza placa", async () => {
    const { db, wo } = await setup();
    const ok = await addVehicle(db, wo.customerId, { category: "MOTO", model: "Biz", plate: "dde-4f56" });
    expect(ok.ok).toBe(true);
    expect((await db.select().from(vehicles).where(eqPlate("DDE4F56")))).toHaveLength(1);
    expect((await addVehicle(db, wo.customerId, { category: "MOTO", model: "Biz 2", plate: "DDE4F56" })).ok).toBe(false);
    expect((await addVehicle(db, wo.customerId, { category: "MOTO", model: "X", plate: "??" })).ok).toBe(false);
    expect((await addVehicle(db, wo.customerId, { category: "MOTO", model: "Sem placa" })).ok).toBe(true);
  });

  it("atualiza dados do cliente com validação", async () => {
    const { db, wo } = await setup();
    expect((await updateCustomer(db, wo.customerId, { name: "Maria S.", email: "m@example.com", notes: "VIP", marketingConsent: true })).ok).toBe(true);
    expect((await updateCustomer(db, wo.customerId, { name: "M", marketingConsent: false })).ok).toBe(false);
    expect((await updateCustomer(db, wo.customerId, { name: "Maria", email: "nao-e-email", marketingConsent: false })).ok).toBe(false);
    const [c] = await db.select().from(customers);
    expect(c!.marketingConsent).toBe(true);
  });
});

import { eq } from "drizzle-orm";
function eqPlate(p: string) {
  return eq(vehicles.plate, p);
}
