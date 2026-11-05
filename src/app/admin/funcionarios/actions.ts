"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { createStaffUser, resetStaffPassword, updateStaffUser, type StaffResult } from "@/modules/staff/staff";

const BASE = "/admin/funcionarios";
const uuid = z.string().uuid();
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

async function finish(userId: string, action: string, entityId: string | null, result: StaffResult<unknown>, okMessage: string): Promise<never> {
  if (!result.ok) redirect(`${BASE}?erro=${encodeURIComponent(result.message)}`);
  // Nunca registrar senhas na auditoria.
  await (await getDb()).insert(auditLogs).values({ userId, action, entity: "user", entityId });
  revalidatePath(BASE);
  redirect(`${BASE}?ok=${encodeURIComponent(okMessage)}`);
}

export async function createStaffAction(fd: FormData): Promise<void> {
  const actor = await requirePermission("funcionarios:gerir");
  const result = await createStaffUser(await getDb(), {
    name: str(fd, "name"),
    email: str(fd, "email"),
    role: str(fd, "role") as never,
    password: str(fd, "password"),
  });
  await finish(actor.id, "staff.create", result.ok ? result.value.id : null, result, "Funcionário cadastrado.");
}

export async function updateStaffAction(fd: FormData): Promise<void> {
  const actor = await requirePermission("funcionarios:gerir");
  const id = uuid.safeParse(str(fd, "userId"));
  if (!id.success) redirect(BASE);
  const result = await updateStaffUser(await getDb(), actor.id, id.data, {
    name: str(fd, "name"),
    role: str(fd, "role") as never,
    active: fd.get("active") === "on",
  });
  await finish(actor.id, "staff.update", id.data, result, "Funcionário atualizado.");
}

export async function resetPasswordAction(fd: FormData): Promise<void> {
  const actor = await requirePermission("funcionarios:gerir");
  const id = uuid.safeParse(str(fd, "userId"));
  if (!id.success) redirect(BASE);
  const result = await resetStaffPassword(await getDb(), id.data, str(fd, "password"));
  await finish(actor.id, "staff.reset_password", id.data, result, "Senha redefinida. As sessões abertas desse usuário foram encerradas.");
}
