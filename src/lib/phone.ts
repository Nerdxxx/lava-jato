/** Normaliza telefone brasileiro para apenas dígitos com DDD (10 ou 11 dígitos). Retorna null se inválido. */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return null;
  if (digits.length === 11 && digits[2] !== "9") return null;
  return digits;
}

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23), sem hífen, em maiúsculas. */
export function normalizePlate(input: string): string | null {
  const p = input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p) ? p : null;
}
