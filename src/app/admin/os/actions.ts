"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLogs, workOrders } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { canAccessWorkOrder } from "@/lib/work-order-access";
import {
  applyDiscount,
  assignWorkOrder,
  changeWorkOrderStatus,
  checkInAppointment,
  createWalkInWorkOrder,
  toggleChecklistItem,
  updateNotes,
} from "@/modules/operations/work-orders";
import { WORK_ORDER_STATUSES } from "@/modules/operations/state-machine";
import { parseMoneyToCents } from "@/modules/scheduling/config";

const uuid = z.string().uuid();
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

function back(path: string, kind: "ok" | "erro", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

/** Carrega a OS e confirma que o usuário pode mexer nela (regra do funcionário). */
async function authorize(permission: Permission, fd: FormData, returnTo = "/admin/fila") {
  const user = await requirePermission(permission);
  const id = uuid.safeParse(str(fd, "workOrderId"));
  if (!id.success) back(returnTo, "erro", "OS inválida.");
  const db = await getDb();
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id.data)).limit(1);
  if (!wo || !canAccessWorkOrder(user, wo)) back(returnTo, "erro", "OS não encontrada.");
  return { user, db, wo };
}

async function audit(userId: string, action: string, entityId: string, details?: string) {
  const db = await getDb();
  await db.insert(auditLogs).values({ userId, action, entity: "work_order", entityId, details });
}

export async function changeStatusAction(fd: FormData): Promise<void> {
  const fromDetail = str(fd, "from") === "detail";
  const { user, db, wo } = await authorize("fila:atualizar", fd);
  const dest = fromDetail ? `/admin/os/${wo.id}` : "/admin/fila";
  const to = z.enum(WORK_ORDER_STATUSES).safeParse(str(fd, "to"));
  if (!to.success) back(dest, "erro", "Status inválido.");
  const res = await changeWorkOrderStatus(db, wo.id, to.data, user.id, str(fd, "note") || undefined);
  if (!res.ok) back(dest, "erro", res.message);
  await audit(user.id, "work_order.status", wo.id, to.data);
  revalidatePath("/admin/fila");
  back(dest, "ok", "Status atualizado.");
}

export async function toggleChecklistAction(fd: FormData): Promise<void> {
  const { user, db, wo } = await authorize("fila:atualizar", fd);
  const itemId = uuid.safeParse(str(fd, "itemId"));
  const dest = `/admin/os/${wo.id}`;
  if (!itemId.success) back(dest, "erro", "Item inválido.");
  const res = await toggleChecklistItem(db, itemId.data, str(fd, "done") === "true", user.id);
  if (!res.ok) back(dest, "erro", res.message);
  revalidatePath(dest);
  redirect(dest);
}

export async function assignAction(fd: FormData): Promise<void> {
  const { user, db, wo } = await authorize("os:gerir", fd);
  const dest = `/admin/os/${wo.id}`;
  const raw = str(fd, "assigneeId");
  const assignee = raw === "" ? null : uuid.safeParse(raw).success ? raw : undefined;
  if (assignee === undefined) back(dest, "erro", "Responsável inválido.");
  const res = await assignWorkOrder(db, wo.id, assignee);
  if (!res.ok) back(dest, "erro", res.message);
  await audit(user.id, "work_order.assign", wo.id, assignee ?? "nenhum");
  back(dest, "ok", "Responsável atualizado.");
}

export async function discountAction(fd: FormData): Promise<void> {
  const { user, db, wo } = await authorize("financeiro:receber", fd);
  const dest = `/admin/os/${wo.id}`;
  const raw = str(fd, "discount");
  const cents = raw === "" ? 0 : parseMoneyToCents(raw);
  if (cents === null) back(dest, "erro", "Valor de desconto inválido.");
  const res = await applyDiscount(db, wo.id, cents);
  if (!res.ok) back(dest, "erro", res.message);
  await audit(user.id, "work_order.discount", wo.id, String(cents));
  back(dest, "ok", "Desconto aplicado.");
}

export async function notesAction(fd: FormData): Promise<void> {
  const { db, wo } = await authorize("fila:atualizar", fd);
  await updateNotes(db, wo.id, str(fd, "notes"));
  back(`/admin/os/${wo.id}`, "ok", "Observações salvas.");
}

export async function checkInAction(fd: FormData): Promise<void> {
  const user = await requirePermission("os:gerir");
  const id = uuid.safeParse(str(fd, "appointmentId"));
  if (!id.success) back("/admin/agenda", "erro", "Agendamento inválido.");
  const res = await checkInAppointment(await getDb(), id.data, user.id);
  if (!res.ok) back("/admin/agenda", "erro", res.message);
  await audit(user.id, "work_order.checkin", res.value.id, id.data);
  revalidatePath("/admin/fila");
  redirect(`/admin/os/${res.value.id}`);
}

export async function createWalkInAction(fd: FormData): Promise<void> {
  const user = await requirePermission("os:gerir");
  const res = await createWalkInWorkOrder(
    await getDb(),
    {
      name: str(fd, "name"),
      phone: str(fd, "phone"),
      category: str(fd, "category") as never,
      serviceId: str(fd, "serviceId"),
      vehicleModel: str(fd, "vehicleModel"),
      plate: str(fd, "plate") || undefined,
      notes: str(fd, "notes") || undefined,
    },
    user.id,
  );
  if (!res.ok) back("/admin/os/nova", "erro", res.message);
  await audit(user.id, "work_order.create", res.value.id, "walk-in");
  revalidatePath("/admin/fila");
  redirect(`/admin/os/${res.value.id}`);
}
