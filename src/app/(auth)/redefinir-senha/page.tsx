import Link from "next/link";
import { getDb } from "@/db/client";
import { Brand } from "@/components/layout/brand";
import { Card } from "@/components/ui/card";
import { checkResetToken } from "@/modules/customers/portal";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Definir senha" };
export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const row = t ? await checkResetToken(await getDb(), t) : null;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy-950 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Brand size={56} light />
        </div>
        <Card>
          <h1 className="mb-1 text-xl font-extrabold">Definir senha</h1>
          {row && t ? (
            <>
              <p className="mb-4 text-sm text-muted">
                Conta: <strong>{row.email}</strong>
              </p>
              <ResetForm token={t} />
            </>
          ) : (
            <p className="text-sm">
              Este link é inválido, já foi usado ou expirou. Peça um novo link ao lava jato.{" "}
              <Link href="/esqueci-senha" className="underline">
                Saiba como
              </Link>
              .
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}
