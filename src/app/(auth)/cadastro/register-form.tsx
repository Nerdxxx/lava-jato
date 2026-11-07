"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { registerAction, type FormState } from "./actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <Field label="Nome" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={120} />
      </Field>
      <Field label="WhatsApp (com DDD)" htmlFor="phone">
        <Input id="phone" name="phone" inputMode="tel" autoComplete="tel" placeholder="(79) 99999-9999" required />
      </Field>
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Senha (mín. 10 caracteres, letras e números)" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirme a senha" htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <details className="rounded-lg border border-line p-3 text-sm">
        <summary className="cursor-pointer font-medium">Já fui atendido(a) no lava jato</summary>
        <p className="mt-2 text-muted">
          Para ver seu histórico, informe o código de um agendamento seu (está na confirmação do agendamento). Se não tiver, peça um link de acesso ao
          lava jato.
        </p>
        <div className="mt-2">
          <Field label="Código do agendamento" htmlFor="appointmentCode">
            <Input id="appointmentCode" name="appointmentCode" maxLength={12} autoCapitalize="characters" />
          </Field>
        </div>
      </details>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="terms" required className="mt-1" />
        <span>
          Concordo com o uso dos meus dados para agendamentos e atendimento (
          <a href="/privacidade" target="_blank" className="underline">
            política de privacidade
          </a>
          ).
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="marketing" className="mt-1" />
        <span>Quero receber promoções pelo WhatsApp (opcional).</span>
      </label>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Criando conta..." : "Criar conta"}
      </Button>
    </form>
  );
}
