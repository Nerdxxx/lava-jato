import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Criar conta" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(isStaff(user.role) ? "/admin" : "/cliente");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy-950 p-4">
      <div className="w-full max-w-md space-y-6 py-6">
        <div className="flex justify-center">
          <Brand size={56} light />
        </div>
        <Card>
          <h1 className="mb-1 text-xl font-extrabold">Criar conta</h1>
          <p className="mb-4 text-sm text-muted">Acompanhe seus agendamentos, o andamento da lavagem, fotos e pontos de fidelidade.</p>
          <RegisterForm />
          <p className="mt-4 text-center text-sm">
            Já tem conta?{" "}
            <Link href="/entrar" className="font-semibold underline">
              Entrar
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
