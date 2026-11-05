import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <section className="grid items-center gap-8 md:grid-cols-2">
      <div className="space-y-5">
        <h1 className="text-3xl font-extrabold leading-tight text-navy-950 sm:text-4xl">
          Seu carro limpo, do jeito que o Capuã merece.
        </h1>
        <p className="text-muted">
          Lavagem externa, lavagem completa com limpeza interna básica e lavagem de motos, em Barra dos Coqueiros.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/agendar" className={buttonVariants()}>
            Agendar lavagem
          </Link>
          <Link href="/precos" className={buttonVariants({ variant: "outline" })}>
            Ver tabela de preços
          </Link>
        </div>
      </div>
      <Image
        src="/branding/logo-ljc.png"
        alt="Logo do Lava Jato Capuã"
        width={520}
        height={480}
        className="mx-auto h-auto w-full max-w-sm"
        priority
      />
    </section>
  );
}
