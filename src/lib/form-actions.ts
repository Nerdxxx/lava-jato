import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";

/** Lê um campo de texto do formulário (sempre string, aparada). */
export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Inteiro não negativo a partir do formulário (aceita "1.000"); null se inválido. */
export function int(fd: FormData, key: string): number | null {
  const raw = str(fd, key).replace(/\./g, "");
  if (!/^-?\d{1,9}$/.test(raw)) return null;
  return Number(raw);
}

/** Volta para a página com mensagem de sucesso/erro na query string. */
export function back(path: string, kind: "ok" | "erro", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

export async function audit(userId: string | null, action: string, entity: string, entityId: string | null, details?: string) {
  const db = await getDb();
  await db.insert(auditLogs).values({ userId, action, entity, entityId, details: details?.slice(0, 2000) });
}
