"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLogs, users } from "@/db/schema";
import { SESSION_COOKIE, clientIp, logout } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { isStaff } from "@/lib/permissions";
import { clearAttempts, createSession, isRateLimited, recordFailedAttempt } from "@/lib/session-core";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254),
  password: z.string().min(1, "Informe a senha.").max(128),
});

export interface LoginState {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
}

// Hash fictício para igualar o tempo de resposta quando o e-mail não existe (evita enumeração de usuários).
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm8";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { email: f.email?.[0], password: f.password?.[0] } };
  }
  const { email, password } = parsed.data;
  const db = await getDb();
  const key = `${email}|${await clientIp()}`;

  if (await isRateLimited(db, key)) {
    return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const valid = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
  if (!user || !user.active || !valid) {
    await recordFailedAttempt(db, key);
    return { error: "E-mail ou senha inválidos." };
  }

  await clearAttempts(db, key);
  const { token, expiresAt } = await createSession(db, user.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  await db.insert(auditLogs).values({ userId: user.id, action: "auth.login", entity: "user", entityId: user.id });
  redirect(isStaff(user.role) ? "/admin" : "/cliente");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/entrar");
}
