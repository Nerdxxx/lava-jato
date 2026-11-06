"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireCustomer, SESSION_COOKIE } from "@/lib/auth";
import { audit, back } from "@/lib/form-actions";
import { updateOwnProfile } from "@/modules/customers/portal";
import { changeOwnPassword } from "@/modules/staff/staff";

const PATH = "/cliente/conta";
const raw = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

export async function updateProfileAction(fd: FormData): Promise<void> {
  const user = await requireCustomer();
  const res = await updateOwnProfile(await getDb(), user.id, { name: raw(fd, "name"), marketingConsent: fd.get("marketing") === "on" });
  if (!res.ok) back(PATH, "erro", res.message);
  await audit(user.id, "customer.self_update", "user", user.id, `marketing:${fd.get("marketing") === "on"}`);
  revalidatePath("/cliente", "layout");
  back(PATH, "ok", "Dados atualizados.");
}

export async function changeCustomerPasswordAction(fd: FormData): Promise<void> {
  const user = await requireCustomer();
  const next = raw(fd, "newPassword");
  if (next !== raw(fd, "confirmPassword")) back(PATH, "erro", "A confirmação não confere com a nova senha.");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await changeOwnPassword(await getDb(), user.id, raw(fd, "currentPassword"), next, token);
  if (!res.ok) back(PATH, "erro", res.message);
  await audit(user.id, "auth.change_password", "user", user.id);
  back(PATH, "ok", "Senha alterada. Outras sessões abertas foram encerradas.");
}
