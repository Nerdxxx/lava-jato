"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { addVehicle, updateCustomer } from "@/modules/customers/customers";

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
