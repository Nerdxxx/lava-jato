import { getDb } from "@/db/client";
import { Flash } from "@/components/layout/flash";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requireCustomer } from "@/lib/auth";
import { formatPhoneBR } from "@/modules/business/profile";
import { getCustomerForUser } from "@/modules/customers/portal";
import { changeCustomerPasswordAction, updateProfileAction } from "./actions";

export const metadata = { title: "Minha conta" };
export const dynamic = "force-dynamic";

export default async function CustomerAccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireCustomer();
  const { ok, erro } = await searchParams;
  const customer = await getCustomerForUser(await getDb(), user.id);
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-extrabold text-navy-950">Minha conta</h1>
      <Flash ok={ok} erro={erro} />
      <Card>
        <form action={updateProfileAction} className="space-y-4">
          <h2 className="font-bold">Meus dados</h2>
          <p className="text-sm text-muted">
            E-mail: {user.email}
            {customer ? ` · WhatsApp: ${formatPhoneBR(customer.phone)}` : ""}
          </p>
          <Field label="Nome" htmlFor="name">
            <Input id="name" name="name" defaultValue={customer?.name ?? user.name} required minLength={2} maxLength={120} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="marketing" defaultChecked={customer?.marketingConsent ?? false} className="mt-1" />
            <span>Quero receber promoções pelo WhatsApp.</span>
          </label>
          <p className="text-xs text-muted">Para trocar e-mail ou WhatsApp, fale com o lava jato.</p>
          <Button type="submit">Salvar</Button>
        </form>
      </Card>
      <Card>
        <form action={changeCustomerPasswordAction} className="space-y-4">
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
