import { redirect } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { Flash } from "@/components/layout/flash";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(isStaff(user.role) ? "/admin" : "/cliente");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy-950 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Brand size={56} light />
        </div>
        <Card>
          <h1 className="mb-4 text-xl font-extrabold">Entrar</h1>
          <div className="mb-4">
            <Flash ok={ok} />
          </div>
          <LoginForm />
          <div className="mt-4 flex justify-between text-sm">
            <Link href="/esqueci-senha" className="underline">
              Esqueci minha senha
            </Link>
            <Link href="/cadastro" className="font-semibold underline">
              Criar conta
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
