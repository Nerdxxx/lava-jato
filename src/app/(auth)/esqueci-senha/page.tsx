import Link from "next/link";
import { getDb } from "@/db/client";
import { Brand } from "@/components/layout/brand";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { loadProfile } from "@/modules/business/profile";
import { waLink } from "@/modules/notifications/whatsapp";

export const metadata = { title: "Esqueci minha senha" };
export const dynamic = "force-dynamic";

export default async function ForgotPage() {
  const profile = await loadProfile(await getDb());
  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy-950 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Brand size={56} light />
        </div>
        <Card className="space-y-3">
          <h1 className="text-xl font-extrabold">Esqueci minha senha</h1>
          <p className="text-sm text-muted">
            Por segurança, o link para criar uma nova senha é enviado pela equipe do lava jato. Fale com a gente pelo WhatsApp informando o seu nome e o
            e-mail cadastrado.
          </p>
          {profile.whatsapp ? (
            <a
              href={waLink(profile.whatsapp, "Olá! Esqueci a senha do meu acesso ao site. Meu e-mail cadastrado é: ")}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ className: "w-full" })}
            >
              Falar no WhatsApp
            </a>
          ) : (
            <p className="text-sm">Procure o atendimento do lava jato.</p>
          )}
          <p className="text-sm">
            Funcionários: peçam ao administrador para redefinir a senha em <em>Funcionários</em>.
          </p>
          <Link href="/entrar" className="block text-center text-sm underline">
            Voltar para o login
          </Link>
        </Card>
      </div>
    </main>
  );
}
