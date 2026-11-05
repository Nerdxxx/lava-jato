import { getDb } from "@/db/client";
import { Flash } from "@/components/layout/flash";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requirePermission } from "@/lib/auth";
import { listStaffUsers, STAFF_ROLES } from "@/modules/staff/staff";
import { createStaffAction, resetPasswordAction, updateStaffAction } from "./actions";

export const metadata = { title: "Funcionários" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { ADMINISTRADOR: "Administrador", FUNCIONARIO: "Funcionário", ATENDENTE: "Atendente" };
const ROLE_HINT = "Administrador: tudo. Atendente: agenda, clientes, check-in e OS. Funcionário: fila, checklist e fotos das OS atribuídas.";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const me = await requirePermission("funcionarios:gerir");
  const { ok, erro } = await searchParams;
  const staff = await listStaffUsers(await getDb());

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold text-navy-950">Funcionários</h1>
      <Flash ok={ok} erro={erro} />

      <Card className="space-y-3">
        <h2 className="font-bold">Novo funcionário</h2>
        <p className="text-xs text-muted">{ROLE_HINT}</p>
        <form action={createStaffAction} className="grid gap-3 sm:grid-cols-2" autoComplete="off">
          <Field label="Nome" htmlFor="new-name">
            <Input id="new-name" name="name" required maxLength={120} />
          </Field>
          <Field label="E-mail (será o login)" htmlFor="new-email">
            <Input id="new-email" name="email" type="email" required maxLength={254} autoComplete="off" />
          </Field>
          <Field label="Perfil" htmlFor="new-role">
            <select id="new-role" name="role" defaultValue="FUNCIONARIO" className="min-h-11 w-full rounded-lg border border-line bg-surface px-3">
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Senha inicial (mín. 10, com letras e números)" htmlFor="new-password">
            <Input id="new-password" name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Cadastrar</Button>
          </div>
        </form>
        <p className="text-xs text-muted">Combine a senha inicial com a pessoa por um canal seguro. Ela pode trocá-la em “Minha conta”.</p>
      </Card>

      <div className="space-y-3">
        {staff.map((u) => (
          <Card key={u.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">
                {u.name} {u.id === me.id && <span className="text-xs font-normal text-muted">(você)</span>}
              </p>
              <Badge tone={u.active ? "success" : "danger"}>{u.active ? "Ativo" : "Desativado"}</Badge>
            </div>
            <p className="text-sm text-muted">{u.email}</p>
            <form action={updateStaffAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="userId" value={u.id} />
              <Field label="Nome" htmlFor={`name-${u.id}`}>
                <Input id={`name-${u.id}`} name="name" defaultValue={u.name} required maxLength={120} className="w-52" />
              </Field>
              <Field label="Perfil" htmlFor={`role-${u.id}`}>
                <select id={`role-${u.id}`} name="role" defaultValue={u.role} disabled={u.id === me.id} className="min-h-11 rounded-lg border border-line bg-surface px-3 disabled:opacity-60">
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </Field>
              {u.id === me.id && <input type="hidden" name="role" value={u.role} />}
              {u.id === me.id && <input type="hidden" name="active" value="on" />}
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={u.active} disabled={u.id === me.id} className="size-5" /> Ativo
              </label>
              <Button type="submit" variant="outline">
                Salvar
              </Button>
            </form>
            <form action={resetPasswordAction} className="flex flex-wrap items-end gap-2 border-t border-line pt-3" autoComplete="off">
              <input type="hidden" name="userId" value={u.id} />
              <Field label="Redefinir senha" htmlFor={`pw-${u.id}`}>
                <Input id={`pw-${u.id}`} name="password" type="password" minLength={10} maxLength={128} autoComplete="new-password" placeholder="Nova senha" className="w-52" />
              </Field>
              <Button type="submit" variant="outline">
                Redefinir
              </Button>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
