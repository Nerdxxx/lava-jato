import { hash, verify } from "@node-rs/argon2";

// Argon2id (algoritmo padrão do pacote = Argon2id).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) return "A senha deve ter ao menos 10 caracteres.";
  if (password.length > 128) return "A senha deve ter no máximo 128 caracteres.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letras e números na senha.";
  return null;
}
