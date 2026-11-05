import { Flash } from "@/components/layout/flash";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requireStaff } from "@/lib/auth";
import { changePasswordAction } from "./actions";

export const metadata = { title: "Minha conta" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireStaff();
  const { ok, erro } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-extrabold text-navy-950">Minha conta</h1>
      <p className="text-sm text-muted">
        {user.name} · {user.email}
      </p>
      <Flash ok={ok} erro={erro} />
      <Card>
        <form action={changePasswordAction} className="space-y-4">
          <h2 className="font-bold">Alterar senha</h2>
          <Field label="Senha atual" htmlFor="currentPassword">
            <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
          </Field>
          <Field label="Nova senha (mín. 10, com letras e números)" htmlFor="newPassword">
            <Input id="newPassword" name="newPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" />
          </Field>
          <Field label="Confirmar nova senha" htmlFor="confirmPassword">
            <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" />
          </Field>
          <Button type="submit">Alterar senha</Button>
        </form>
      </Card>
    </div>
  );
}
