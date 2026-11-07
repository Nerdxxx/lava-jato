import { getDb } from "@/db/client";
import { WhatsAppIcon } from "@/components/site/brand-icons";
import { MobileCtaBar } from "@/components/site/mobile-cta-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader, type SiteNavItem } from "@/components/site/site-header";
import { getOpeningHours } from "@/modules/business/hours";
import { loadProfile } from "@/modules/business/profile";
import { waLink } from "@/modules/notifications/whatsapp";
import { loadAddons } from "@/modules/scheduling/addons";
import { getCatalog } from "@/modules/scheduling/catalog";

const NAV: SiteNavItem[] = [
  { href: "/#servicos", label: "Serviços" },
  { href: "/precos", label: "Preços" },
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/agendamento", label: "Meu agendamento" },
  { href: "/contato", label: "Contato" },
];

const QUICK_LINKS: SiteNavItem[] = [
  { href: "/", label: "Início" },
  { href: "/precos", label: "Tabela de preços" },
  { href: "/agendar", label: "Agendar lavagem" },
  { href: "/agendamento", label: "Consultar agendamento" },
  { href: "/cliente", label: "Minha conta" },
  { href: "/contato", label: "Contato" },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const [profile, hours, catalog, addons] = await Promise.all([loadProfile(db), getOpeningHours(db), getCatalog(db), loadAddons(db)]);
  const footerServices = [
    ...(catalog.some((s) => typeof s.prices.MOTO === "number") ? [{ name: "Lavagem de motos" }] : []),
    ...catalog.filter((s) => Object.entries(s.prices).some(([c]) => c !== "MOTO")).map((s) => ({ name: s.name })),
    ...addons.filter((a) => a.active && a.categories.length > 0).map((a) => ({ name: a.name })),
  ];
  const whatsappHref = profile.whatsapp ? waLink(profile.whatsapp, "Olá! Vim pelo site do lava jato.") : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-sun-400 px-4 py-2 font-semibold text-navy-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      <SiteHeader nav={NAV} />
      <main id="conteudo" className="flex-1">
        {children}
      </main>
      <SiteFooter profile={profile} hours={hours} services={footerServices} quickLinks={QUICK_LINKS} whatsappHref={whatsappHref} />
      {/* espaço da barra inferior de agendamento no celular, para ela nunca cobrir o rodapé */}
      <div aria-hidden className="h-20 bg-navy-950 lg:hidden" />
      <MobileCtaBar whatsappHref={whatsappHref} />
      {whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
          data-print-hide
          className="fixed bottom-6 right-6 z-30 hidden size-14 items-center justify-center rounded-full bg-whatsapp text-white shadow-lg shadow-navy-950/25 transition hover:scale-105 lg:flex"
        >
          <WhatsAppIcon className="size-7" />
        </a>
      )}
    </div>
  );
}
