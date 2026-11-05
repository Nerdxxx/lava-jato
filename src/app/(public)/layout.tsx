import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { buttonVariants } from "@/components/ui/button";

const NAV = [
  { href: "/precos", label: "Preços" },
  { href: "/agendamento", label: "Meu agendamento" },
  { href: "/entrar", label: "Entrar" },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-navy-950 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Brand light />
          <nav className="flex items-center gap-4 text-sm font-medium">
            {NAV.map((i) => (
              <Link key={i.href} href={i.href} className="hover:text-aqua-400">
                {i.label}
              </Link>
            ))}
            <Link href="/agendar" className={buttonVariants({ className: "min-h-9 px-4" })}>
              Agendar
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <footer className="bg-navy-950 py-6 text-center text-sm text-white/70">
        Lava Jato Capuã · Povoado Capuã, Barra dos Coqueiros — SE
      </footer>
    </div>
  );
}
