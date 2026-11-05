const buckets = new Map<string, number[]>();

/**
 * Limitador em memória (janela deslizante). Suficiente para uma instância única;
 * com várias instâncias, trocar por armazenamento compartilhado (Redis/Postgres).
 */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  return true;
}
