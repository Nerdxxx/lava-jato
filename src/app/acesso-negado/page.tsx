import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Acesso negado" };

export default function Forbidden() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-extrabold">Acesso negado</h1>
      <p className="text-muted">Seu perfil não tem permissão para acessar esta página.</p>
      <Link href="/" className={buttonVariants()}>
        Voltar ao início
      </Link>
    </main>
  );
}
