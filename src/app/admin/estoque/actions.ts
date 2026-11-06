"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth";
import { audit, back, int, str } from "@/lib/form-actions";
import { createItem, deleteRule, INVENTORY_UNITS, recordMovement, updateItem, upsertRule } from "@/modules/inventory/inventory";
import { VEHICLE_CATEGORIES } from "@/modules/scheduling/booking";

const PATH = "/admin/estoque";
const uuid = z.string().uuid();

export async function createItemAction(fd: FormData): Promise<void> {
  const user = await requirePermission("estoque:gerir");
  const unit = z.enum(INVENTORY_UNITS).safeParse(str(fd, "unit"));
  const min = str(fd, "minQuantity") === "" ? 0 : int(fd, "minQuantity");
  const initial = str(fd, "initialQuantity") === "" ? 0 : int(fd, "initialQuantity");
  if (!unit.success || min === null || initial === null) back(PATH, "erro", "Preencha unidade e quantidades com números inteiros.");
  const res = await createItem(await getDb(), { name: str(fd, "name"), unit: unit.data, minQuantity: min, initialQuantity: initial }, user.id);
  if (!res.ok) back(PATH, "erro", res.message);
  await audit(user.id, "inventory.item.create", "inventory_item", res.value.id, str(fd, "name"));
  revalidatePath(PATH);
  back(PATH, "ok", "Produto cadastrado.");
}

export async function updateItemAction(fd: FormData): Promise<void> {
  const user = await requirePermission("estoque:gerir");
  const id = uuid.safeParse(str(fd, "itemId"));
  if (!id.success) back(PATH, "erro", "Produto inválido.");
  const min = int(fd, "minQuantity");
  const toggle = str(fd, "active");
  const res = await updateItem(await getDb(), id.data, {
    ...(min !== null ? { minQuantity: min } : {}),
    ...(toggle ? { active: toggle === "true" } : {}),
  });
  if (!res.ok) back(PATH, "erro", res.message);
  await audit(user.id, "inventory.item.update", "inventory_item", id.data, toggle ? `active:${toggle}` : `min:${min}`);
  revalidatePath(PATH);
  back(PATH, "ok", "Produto atualizado.");
}

export async function movementAction(fd: FormData): Promise<void> {
  const user = await requirePermission("estoque:gerir");
  const id = uuid.safeParse(str(fd, "itemId"));
  const type = z.enum(["ENTRADA", "SAIDA", "AJUSTE"]).safeParse(str(fd, "type"));
  const qty = int(fd, "quantity");
  if (!id.success || !type.success || qty === null) back(PATH, "erro", "Informe produto, tipo e quantidade (número inteiro).");
  const res = await recordMovement(await getDb(), { itemId: id.data, type: type.data, quantity: qty, reason: str(fd, "reason") || undefined }, user.id);
  if (!res.ok) back(PATH, "erro", res.message);
  await audit(user.id, `inventory.${type.data.toLowerCase()}`, "inventory_item", id.data, String(qty));
  revalidatePath(PATH);
  back(PATH, "ok", `Movimentação registrada. Saldo atual: ${res.value.balance.toLocaleString("pt-BR")}.`);
}

export async function saveRuleAction(fd: FormData): Promise<void> {
  const user = await requirePermission("estoque:gerir");
  const cat = str(fd, "category");
  const category = cat === "" ? null : z.enum(VEHICLE_CATEGORIES).safeParse(cat).data;
  const qty = int(fd, "quantity");
  if (category === undefined || qty === null) back(PATH, "erro", "Dados da regra inválidos.");
  const res = await upsertRule(await getDb(), { serviceId: str(fd, "serviceId"), itemId: str(fd, "itemId"), category, quantity: qty });
  if (!res.ok) back(PATH, "erro", res.message);
  await audit(user.id, "inventory.rule.save", "service", str(fd, "serviceId"), `${str(fd, "itemId")}:${cat || "todas"}:${qty}`);
  revalidatePath(PATH);
  back(PATH, "ok", "Regra de consumo salva.");
}

export async function deleteRuleAction(fd: FormData): Promise<void> {
  const user = await requirePermission("estoque:gerir");
  const id = uuid.safeParse(str(fd, "ruleId"));
  if (!id.success) back(PATH, "erro", "Regra inválida.");
  const res = await deleteRule(await getDb(), id.data);
  if (!res.ok) back(PATH, "erro", res.message);
  await audit(user.id, "inventory.rule.delete", "service_consumption_rule", id.data);
  revalidatePath(PATH);
  back(PATH, "ok", "Regra removida.");
}
