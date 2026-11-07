import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import type { DayHours } from "@/modules/business/hours";
import { formatPhoneBR, type BusinessProfile } from "@/modules/business/profile";
import { InstagramIcon, WhatsAppIcon } from "./brand-icons";
import { Container } from "./section";
import { SiteBrand, type SiteNavItem } from "./site-header";

/** Agrupa dias seguidos com o mesmo horário: "Segunda a sábado: 08:00–18:00". */
export function compactHours(hours: DayHours[]): { label: string; hours: string }[] {
  const out: { first: string; last: string; hours: string }[] = [];
  for (const h of hours) {
    const prev = out[out.length - 1];
    if (prev && prev.hours === h.hours) prev.last = h.day;
    else out.push({ first: h.day, last: h.day, hours: h.hours });
  }
  return out.map((g) => ({
    label: g.first === g.last ? g.first : `${g.first} a ${g.last.toLowerCase()}`,
    hours: g.hours,
  }));
}

export function SiteFooter({
  profile,
  hours,
  services,
  quickLinks,
  whatsappHref,
}: {
  profile: BusinessProfile;
  hours: DayHours[];
  services: { name: string }[];
  quickLinks: SiteNavItem[];
  whatsappHref: string | null;
}) {
  const grouped = compactHours(hours);
  return (
    <footer data-print-hide className="relative overflow-hidden bg-navy-950 text-white/75">
      <div aria-hidden className="h-1 bg-gradient-to-r from-ocean-600 via-aqua-400 to-sun-400" />
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div className="space-y-4">
          <SiteBrand />
          <p className="max-w-xs text-sm">
            Lavagem automotiva com cuidado e atenção aos detalhes no Povoado Capuã, Barra dos Coqueiros — Sergipe.
          </p>
          <div className="flex gap-2">
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="flex size-10 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-whatsapp"
              >
                <WhatsAppIcon className="size-5" />
              </a>
            )}
            {profile.instagram && (
              <a
                href={`https://instagram.com/${profile.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Instagram @${profile.instagram}`}
                className="flex size-10 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-ocean-600"
              >
                <InstagramIcon className="size-5" />
              </a>
            )}
          </div>
        </div>

        <nav aria-label="Links rápidos">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Navegação</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {quickLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-aqua-400">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Serviços</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {services.map((s) => (
              <li key={s.name}>{s.name}</li>
            ))}
            <li>
              <Link href="/agendar" className="font-semibold text-sun-400 hover:text-sun-500">
                Agendar agora →
              </Link>
            </li>
          </ul>
        </div>

        <div className="space-y-5 text-sm">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
              <Clock className="size-4 text-aqua-400" aria-hidden /> Horários
            </h2>
            <dl className="mt-3 space-y-1">
              {grouped.map((g) => (
                <div key={g.label} className="flex flex-wrap justify-between gap-x-3">
                  <dt>{g.label}</dt>
                  <dd className={g.hours === "Fechado" ? "text-white/50" : "text-white"}>{g.hours}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
              <MapPin className="size-4 text-aqua-400" aria-hidden /> Localização
            </h2>
            <p className="mt-3">{profile.address}</p>
            {profile.whatsapp && <p className="mt-1">WhatsApp {formatPhoneBR(profile.whatsapp)}</p>}
            {profile.mapsUrl && (
              <a href={profile.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-aqua-400 hover:underline">
                Como chegar
              </a>
            )}
          </div>
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-3 py-5 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {profile.name}. Todos os direitos reservados.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li>
              <Link href="/privacidade" className="hover:text-white">
                Política de privacidade
              </Link>
            </li>
            <li>
              <Link href="/termos" className="hover:text-white">
                Termos de uso
              </Link>
            </li>
            <li>
              <Link href="/entrar" className="hover:text-white">
                Área da equipe
              </Link>
            </li>
          </ul>
        </Container>
      </div>
    </footer>
  );
}
