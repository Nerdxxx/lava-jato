"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { cookies } from "next/headers";
import { addVehicle, updateCustomer } from "@/modules/customers/customers";
import { createPortalAccess, PORTAL_LINK_COOKIE } from "@/modules/customers/portal";

const uuid = z.string().uuid();
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

function back(id: string, kind: "ok" | "erro", message: string): never {
  redirect(`/admin/clientes/${id}?${kind}=${encodeURIComponent(message)}`);
}

export async function updateCustomerAction(fd: FormData): Promise<void> {
  const user = await requirePermission("clientes:gerir");
  const id = uuid.safeParse(str(fd, "customerId"));
  if (!id.success) redirect("/admin/clientes");
  const res = await updateCustomer(await getDb(), id.data, {
    name: str(fd, "name"),
    email: str(fd, "email"),
    notes: str(fd, "notes"),
    marketingConsent: fd.get("marketingConsent") === "on",
  });
  if (!res.ok) back(id.data, "erro", res.message);
  await (await getDb()).insert(auditLogs).values({ userId: user.id, action: "customer.update", entity: "customer", entityId: id.data });
  back(id.data, "ok", "Cliente atualizado.");
}

export async function addVehicleAction(fd: FormData): Promise<void> {
  const user = await requirePermission("veiculos:gerir");
  const id = uuid.safeParse(str(fd, "customerId"));
  if (!id.success) redirect("/admin/clientes");
  const year = str(fd, "year");
  const res = await addVehicle(await getDb(), id.data, {
    category: str(fd, "category") as never,
    model: str(fd, "model"),
    brand: str(fd, "brand") || undefined,
    color: str(fd, "color") || undefined,
    year: year ? Number(year) : undefined,
    plate: str(fd, "plate") || undefined,
  });
  if (!res.ok) back(id.data, "erro", res.message);
  await (await getDb()).insert(auditLogs).values({ userId: user.id, action: "vehicle.create", entity: "vehicle", entityId: res.value.id });
  back(id.data, "ok", "Veículo cadastrado.");
}

/** Gera o link de primeiro acesso / redefinição de senha do portal do cliente. */
export async function portalAccessAction(fd: FormData): Promise<void> {
  const user = await requirePermission("clientes:gerir");
  const customerId = typeof fd.get("customerId") === "string" ? String(fd.get("customerId")) : "";
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) redirect("/admin/clientes");
  const dest = `/admin/clientes/${customerId}`;
  const db = await getDb();
  const res = await createPortalAccess(db, customerId, typeof fd.get("email") === "string" ? String(fd.get("email")) : "", user.id);
  if (!res.ok) redirect(`${dest}?erro=${encodeURIComponent(res.message)}`);
  await db.insert(auditLogs).values({ userId: user.id, action: "customer.portal_link", entity: "customer", entityId: customerId });
  // O link é mostrado uma vez a quem gerou (cookie httpOnly curto), sem ir para a URL/histórico.
  (await cookies()).set(PORTAL_LINK_COOKIE, res.value.token, { httpOnly: true, sameSite: "strict", path: dest, maxAge: 600, secure: process.env.NODE_ENV === "production" });
  redirect(`${dest}?ok=${encodeURIComponent("Link de acesso gerado. Envie ao cliente pelo WhatsApp (vale 48 h, uso único).")}`);
}
