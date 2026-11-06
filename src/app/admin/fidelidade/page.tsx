import Link from "next/link";
import { getDb } from "@/db/client";
import { Flash } from "@/components/layout/flash";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requirePermission } from "@/lib/auth";
import { loadLoyaltyConfig, topCustomers } from "@/modules/loyalty/loyalty";
import { saveLoyaltyAction } from "./actions";

export const metadata = { title: "Fidelidade" };
export const dynamic = "force-dynamic";

export default async function LoyaltyPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requirePermission("configuracoes:gerir");
  const sp = await searchParams;
  const db = await getDb();
  const [cfg, top] = await Promise.all([loadLoyaltyConfig(db), topCustomers(db)]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-navy-950">Fidelidade</h1>
        <Badge tone={cfg.enabled ? "success" : "neutral"}>{cfg.enabled ? "Ativo" : "Desativado"}</Badge>
      </div>
      <Flash ok={sp.ok} erro={sp.erro} />

      <Card className="space-y-3">
        <h2 className="font-bold">Regras do programa</h2>
        <p className="text-sm text-muted">
          Cada OS entregue e paga vale 1 ponto. Ao juntar os pontos necessários, o atendente aplica o prêmio como desconto na OS. A OS do resgate não
          gera ponto, e OS cancelada devolve os pontos usados.
        </p>
        <form action={saveLoyaltyAction} className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} /> Programa ativo
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Lavagens para ganhar o prêmio" htmlFor="visits">
              <Input id="visits" name="visitsRequired" inputMode="numeric" defaultValue={cfg.visitsRequired} required />
            </Field>
            <Field label="Desconto do prêmio (%)" htmlFor="pct">
              <Input id="pct" name="rewardPercent" inputMode="numeric" defaultValue={cfg.rewardPercent} required />
            </Field>
          </div>
          <p className="text-xs text-muted">Exemplo: 10 lavagens e 100% = a 11ª lavagem sai grátis.</p>
          <Button type="submit">Salvar</Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Clientes com pontos</h2>
        {top.length === 0 ? (
          <p className="text-sm text-muted">Nenhum cliente com pontos ainda.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {top.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                <Link href={`/admin/clientes/${c.id}`} className="font-semibold underline-offset-2 hover:underline">
                  {c.name}
                </Link>
                <span className="flex items-center gap-2">
                  {c.balance >= cfg.visitsRequired && <Badge tone="success">Prêmio disponível</Badge>}
                  <strong>
                    {c.balance} / {cfg.visitsRequired}
                  </strong>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Ajustes manuais de pontos são feitos no perfil do cliente.</p>
      </Card>
    </div>
  );
}
