"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { clientIp, SESSION_COOKIE } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/session-core";
import { registerCustomerAccount, resetPasswordWithToken } from "@/modules/customers/portal";

export interface FormState {
  error?: string;
}

const text = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

async function startSession(userId: string) {
  const db = await getDb();
  const { token, expiresAt } = await createSession(db, userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!rateLimit(`register:${await clientIp()}`, 5, 15 * 60_000)) {
    return { error: "Muitas tentativas. Aguarde alguns minutos." };
  }
  if (text(fd, "password") !== text(fd, "confirmPassword")) return { error: "A confirmação não confere com a senha." };
  if (fd.get("terms") !== "on") return { error: "É preciso concordar com o uso dos seus dados para o atendimento." };
  const db = await getDb();
  const res = await registerCustomerAccount(db, {
    name: text(fd, "name"),
    phone: text(fd, "phone"),
    email: text(fd, "email"),
    password: text(fd, "password"),
    appointmentCode: text(fd, "appointmentCode") || undefined,
    marketingConsent: fd.get("marketing") === "on",
  });
  if (!res.ok) return { error: res.message };
  await db.insert(auditLogs).values({ userId: res.value.userId, action: "auth.register", entity: "user", entityId: res.value.userId });
  await startSession(res.value.userId);
  redirect("/cliente");
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!rateLimit(`reset:${await clientIp()}`, 10, 15 * 60_000)) return { error: "Muitas tentativas. Aguarde alguns minutos." };
  if (text(fd, "password") !== text(fd, "confirmPassword")) return { error: "A confirmação não confere com a senha." };
  const db = await getDb();
  const res = await resetPasswordWithToken(db, text(fd, "token"), text(fd, "password"));
  if (!res.ok) return { error: res.message };
  await db.insert(auditLogs).values({ userId: res.value.userId, action: "auth.reset_password", entity: "user", entityId: res.value.userId });
  redirect(`/entrar?ok=${encodeURIComponent("Senha definida. Entre com seu e-mail e a nova senha.")}`);
}
