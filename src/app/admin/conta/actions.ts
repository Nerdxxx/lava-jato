"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requireStaff, SESSION_COOKIE } from "@/lib/auth";
import { changeOwnPassword } from "@/modules/staff/staff";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

export async function changePasswordAction(fd: FormData): Promise<void> {
  const user = await requireStaff();
  const next = str(fd, "newPassword");
  if (next !== str(fd, "confirmPassword")) redirect(`/admin/conta?erro=${encodeURIComponent("A confirmação não confere com a nova senha.")}`);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const db = await getDb();
  const res = await changeOwnPassword(db, user.id, str(fd, "currentPassword"), next, token);
  if (!res.ok) redirect(`/admin/conta?erro=${encodeURIComponent(res.message)}`);
  await db.insert(auditLogs).values({ userId: user.id, action: "auth.change_password", entity: "user", entityId: user.id });
  redirect(`/admin/conta?ok=${encodeURIComponent("Senha alterada. Outras sessões abertas foram encerradas.")}`);
}
