import Link from "next/link";
import { getDb } from "@/db/client";
import { Brand } from "@/components/layout/brand";
import { buttonVariants } from "@/components/ui/button";
import { formatPhoneBR, loadProfile } from "@/modules/business/profile";
import { waLink } from "@/modules/notifications/whatsapp";

const NAV = [
  { href: "/precos", label: "Preços" },
  { href: "/agendamento", label: "Meu agendamento" },
  { href: "/contato", label: "Contato" },
  { href: "/entrar", label: "Entrar" },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const profile = await loadProfile(await getDb());
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-navy-950 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Brand light />
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium" aria-label="Principal">
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
      <footer className="space-y-1 bg-navy-950 py-6 text-center text-sm text-white/70">
        <p>
          {profile.name} · {profile.address}
        </p>
        {profile.whatsapp && <p>WhatsApp {formatPhoneBR(profile.whatsapp)}</p>}
      </footer>
      {profile.whatsapp && (
        <a
          href={waLink(profile.whatsapp, "Olá! Vim pelo site do lava jato.")}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
          className="fixed bottom-4 right-4 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-2xl text-white shadow-lg hover:opacity-90"
        >
          <span aria-hidden>💬</span>
        </a>
      )}
    </div>
  );
}
