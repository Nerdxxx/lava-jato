import { redirect } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
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
          <LoginForm />
        </Card>
      </div>
    </main>
  );
}
