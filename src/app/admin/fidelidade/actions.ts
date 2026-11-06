"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth";
import { audit, back, int, str } from "@/lib/form-actions";
import { adjustPoints, redeemOnWorkOrder, saveLoyaltyConfig, undoRedemption } from "@/modules/loyalty/loyalty";

const uuid = z.string().uuid();

export async function saveLoyaltyAction(fd: FormData): Promise<void> {
  const user = await requirePermission("configuracoes:gerir");
  const visits = int(fd, "visitsRequired");
  const pct = int(fd, "rewardPercent");
  if (visits === null || pct === null) back("/admin/fidelidade", "erro", "Use números inteiros.");
  const res = await saveLoyaltyConfig(await getDb(), { enabled: fd.get("enabled") === "on", visitsRequired: visits, rewardPercent: pct });
  if (!res.ok) back("/admin/fidelidade", "erro", res.message);
  await audit(user.id, "loyalty.config", "business_settings", "loyalty", JSON.stringify(res.value));
  revalidatePath("/admin/fidelidade");
  back("/admin/fidelidade", "ok", res.value.enabled ? "Programa de fidelidade salvo e ativo." : "Programa salvo (desativado).");
}

export async function adjustPointsAction(fd: FormData): Promise<void> {
  const user = await requirePermission("configuracoes:gerir");
  const customerId = uuid.safeParse(str(fd, "customerId"));
  const dest = customerId.success ? `/admin/clientes/${customerId.data}` : "/admin/clientes";
  const points = int(fd, "points");
  if (!customerId.success || points === null) back(dest, "erro", "Informe a quantidade de pontos (ex.: 2 ou -1).");
  const res = await adjustPoints(await getDb(), customerId.data, points, str(fd, "reason"), user.id);
  if (!res.ok) back(dest, "erro", res.message);
  await audit(user.id, "loyalty.adjust", "customer", customerId.data, `${points}:${str(fd, "reason")}`);
  back(dest, "ok", `Pontos ajustados. Saldo: ${res.value}.`);
}

export async function redeemAction(fd: FormData): Promise<void> {
  const user = await requirePermission("financeiro:receber");
  const wo = uuid.safeParse(str(fd, "workOrderId"));
  if (!wo.success) back("/admin/os", "erro", "OS inválida.");
  const dest = `/admin/os/${wo.data}`;
  const res = await redeemOnWorkOrder(await getDb(), wo.data, user.id);
  if (!res.ok) back(dest, "erro", res.message);
  await audit(user.id, "loyalty.redeem", "work_order", wo.data, String(res.value.discountCents));
  back(dest, "ok", "Prêmio de fidelidade aplicado como desconto.");
}

export async function undoRedeemAction(fd: FormData): Promise<void> {
  const user = await requirePermission("financeiro:receber");
  const wo = uuid.safeParse(str(fd, "workOrderId"));
  if (!wo.success) back("/admin/os", "erro", "OS inválida.");
  const dest = `/admin/os/${wo.data}`;
  const res = await undoRedemption(await getDb(), wo.data, user.id);
  if (!res.ok) back(dest, "erro", res.message);
  await audit(user.id, "loyalty.undo", "work_order", wo.data);
  back(dest, "ok", "Resgate desfeito; pontos devolvidos ao cliente.");
}
