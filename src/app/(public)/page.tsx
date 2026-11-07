import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Droplets, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { getDb } from "@/db/client";
import { AddonsSection } from "@/components/site/addons-section";
import { GallerySection } from "@/components/site/gallery-section";
import { HowItWorks } from "@/components/site/how-it-works";
import { buildOffers } from "@/components/site/offers";
import { bookingHref } from "@/components/site/offers";
import { PriceTable } from "@/components/site/price-table";
import { Container, SectionHeading, WaveBackdrop } from "@/components/site/section";
import { ServiceCards } from "@/components/site/service-cards";
import { HoursCard, LocationCard } from "@/components/site/visit-section";
import { getOpenStatus, getOpeningHours } from "@/modules/business/hours";
import { loadProfile } from "@/modules/business/profile";
import { loadLoyaltyConfig } from "@/modules/loyalty/loyalty";
import { waLink } from "@/modules/notifications/whatsapp";
import { loadAddons } from "@/modules/scheduling/addons";
import { getCatalog } from "@/modules/scheduling/catalog";
import { formatBRL } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BENEFITS = [
  { icon: CalendarCheck, title: "Agendamento fácil", text: "Reserve seu horário sem complicação." },
  { icon: ShieldCheck, title: "Cuidado em cada detalhe", text: "Processo organizado e materiais apropriados." },
  { icon: Droplets, title: "Lavagem externa e completa", text: "Escolha o serviço ideal para seu veículo." },
  { icon: MapPin, title: "Atendimento no Capuã", text: "Conveniência para moradores da região." },
];

export default async function HomePage() {
  const db = await getDb();
  const [catalog, hours, profile, loyalty, addons] = await Promise.all([
    getCatalog(db),
    getOpeningHours(db),
    loadProfile(db),
    loadLoyaltyConfig(db),
    loadAddons(db),
  ]);
  const status = await getOpenStatus(db, hours);
  const offers = buildOffers(catalog);
  const activeAddons = addons.filter((a) => a.active && a.categories.length > 0);
  const whatsappHref = profile.whatsapp ? waLink(profile.whatsapp, "Olá! Vim pelo site do lava jato.") : null;

  // SEO local: dados estruturados só com o que está cadastrado no sistema.
  const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AutoWash",
    name: profile.name,
    image: `${process.env.APP_URL ?? ""}/og.png`,
    url: process.env.APP_URL || undefined,
    telephone: profile.whatsapp ? `+55${profile.whatsapp}` : undefined,
    address: { "@type": "PostalAddress", streetAddress: profile.address, addressLocality: "Barra dos Coqueiros", addressRegion: "SE", addressCountry: "BR" },
    sameAs: profile.instagram ? [`https://instagram.com/${profile.instagram}`] : undefined,
    openingHoursSpecification: hours.flatMap((h) =>
      h.windows.map((w) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: DAY[h.weekday], opens: w.opensAt, closes: w.closesAt })),
    ),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-navy-950 text-white">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,var(--color-navy-800),transparent_60%)]" />
        <WaveBackdrop />
        <Container className="relative grid items-center gap-5 pb-8 pt-6 sm:gap-8 sm:pb-16 sm:pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:pb-24 lg:pt-20">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-aqua-400">
              <MapPin className="size-3.5" aria-hidden />
              Povoado Capuã · Barra dos Coqueiros — SE
            </p>
            <h1 className="type-hero mt-4 uppercase">
              Seu carro limpo, do jeito que o <span className="text-sun-400">Capuã</span> merece.
            </h1>
            <p className="mt-3 max-w-xl text-base text-white/80 sm:mt-5 sm:text-lg">
              Lavagem automotiva com cuidado, capricho e atenção aos detalhes. Agende seu horário de forma rápida e prática.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
              <Link
                href="/agendar"
                className="inline-flex min-h-14 items-center justify-center gap-2 text-center sm:whitespace-nowrap rounded-xl bg-sun-400 px-5 text-[0.95rem] font-extrabold uppercase text-navy-950 shadow-lg shadow-sun-400/20 transition hover:bg-sun-500 active:scale-[0.98]"
              >
                <CalendarCheck className="size-5" aria-hidden />
                Agendar minha lavagem
              </Link>
              <Link
                href="#servicos"
                className="hidden min-h-14 items-center justify-center gap-2 text-center sm:inline-flex sm:whitespace-nowrap rounded-xl border border-white/25 px-5 text-[0.95rem] font-bold uppercase text-white transition hover:border-aqua-400 hover:bg-white/5"
              >
                Conhecer os serviços
                <ArrowRight className="size-5" aria-hidden />
              </Link>
            </div>
            {status && (
              <p className="mt-4 flex items-center gap-2 text-sm text-white/70">
                <span className={status.open ? "size-2 rounded-full bg-[#4ade80]" : "size-2 rounded-full bg-white/40"} aria-hidden />
                {status.open ? "Aberto agora" : "Fechado agora"}
                {status.detail && <span className="text-white/50">· {status.detail}</span>}
              </p>
            )}
          </div>
          <div className="relative mx-auto hidden w-full max-w-[17rem] animate-rise [animation-delay:120ms] sm:block sm:max-w-sm lg:max-w-md">
            <div aria-hidden className="absolute inset-[8%] -z-10 rounded-full bg-aqua-400/20 blur-3xl" />
            <Image
              src="/branding/logo-ljc.png"
              alt="Logo do Lava Jato Capuã: carro esportivo, coqueiros e pôr do sol"
              width={1306}
              height={1205}
              sizes="(min-width: 1024px) 448px, (min-width: 640px) 384px, 272px"
              className="h-auto w-full drop-shadow-[0_20px_40px_rgba(0,0,0,0.45)]"
              priority
            />
          </div>
        </Container>
      </section>

      {/* Prévia compacta com preços derivados do catálogo ativo do banco. */}
      {offers.length > 0 && (
        <section aria-labelledby="precos-rapidos" className="border-b border-line bg-surface py-7 sm:py-9">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-ocean-600">Escolha sua lavagem</p>
                <h2 id="precos-rapidos" className="mt-1 text-xl font-extrabold text-navy-950 sm:text-2xl">Serviços e preços</h2>
              </div>
              <Link href="/precos" className="text-sm font-bold text-ocean-600 hover:underline">Ver tabela completa</Link>
            </div>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {offers.map((offer) => (
                <li key={offer.key}>
                  <Link href={bookingHref(offer.serviceId, offer.category)} className="flex min-h-20 items-center justify-between gap-3 rounded-xl border border-line bg-bg px-4 py-3 transition hover:border-ocean-600/50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-navy-950">{offer.title}</span>
                      <span className="block text-xs text-muted">{offer.varies ? "Carros · valor conforme o veículo" : offer.kind === "moto" ? "Motos" : "Preço do serviço"}</span>
                    </span>
                    <span className="shrink-0 text-lg font-extrabold text-navy-950">{offer.varies && "a partir de "}{formatBRL(offer.minCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      {/* BENEFÍCIOS */}
      <section aria-label="Vantagens" className="relative z-10 mt-0">
        <Container>
          <ul className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-surface p-3 shadow-xl shadow-navy-950/5 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex items-start gap-3 rounded-xl p-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sun-400/20 text-navy-950">
                  <b.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-bold text-navy-950">{b.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{b.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* SERVIÇOS */}
      {offers.length > 0 && (
        <section aria-labelledby="servicos-titulo" id="servicos" className="py-16 sm:py-20">
          <Container>
            <SectionHeading
              id="servicos-titulo"
              eyebrow="Serviços"
              title="Escolha a lavagem ideal"
              description="Preços e durações atualizados direto da nossa tabela. O valor exato aparece ao escolher o veículo."
            />
            <div className="mt-10">
              <ServiceCards offers={offers} />
            </div>
          </Container>
        </section>
      )}

      <AddonsSection addons={activeAddons} />

      {/* PREÇOS */}
      {catalog.length > 0 && (
        <section aria-labelledby="precos" className="py-16 sm:py-20">
          <Container>
            <SectionHeading id="precos" eyebrow="Tabela de preços" title="Preço justo para cada veículo" description="Valores pagos no local, no dia do atendimento." />
            <div className="mt-10">
              <PriceTable catalog={catalog} addons={activeAddons} />
            </div>
          </Container>
        </section>
      )}

      {/* COMO FUNCIONA */}
      <section aria-labelledby="como-funciona-titulo" id="como-funciona" className="border-y border-line bg-surface py-16 sm:py-20">
        <Container>
          <SectionHeading id="como-funciona-titulo" eyebrow="Como funciona" title="Do agendamento à entrega" align="center" />
          <div className="mt-12">
            <HowItWorks />
          </div>
        </Container>
      </section>

      <GallerySection />

      {loyalty.enabled && (
        <section aria-labelledby="fidelidade" className="pb-16 sm:pb-20">
          <Container>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-950 to-navy-800 p-8 text-white sm:p-10">
              <WaveBackdrop />
              <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-sun-400">
                    <Sparkles className="size-4" aria-hidden /> Programa de fidelidade
                  </p>
                  <h2 id="fidelidade" className="type-section mt-2">
                    Cliente fiel ganha
                  </h2>
                  <p className="mt-3 text-white/80">
                    A cada {loyalty.visitsRequired} lavagens, você ganha{" "}
                    {loyalty.rewardPercent === 100 ? "uma lavagem grátis" : `${loyalty.rewardPercent}% de desconto`}. Crie sua conta para acompanhar seus pontos.
                  </p>
                </div>
                <Link
                  href="/cadastro"
                  className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-sun-400 px-6 font-bold text-navy-950 hover:bg-sun-500"
                >
                  Criar minha conta
                </Link>
              </div>
            </div>
          </Container>
        </section>
      )}

      {/* HORÁRIOS E LOCALIZAÇÃO */}
      <section aria-labelledby="visite-titulo" id="visite" className="bg-bg pb-16 sm:pb-20">
        <Container>
          <SectionHeading id="visite-titulo" eyebrow="Visite a gente" title="Horários e localização" />
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <HoursCard hours={hours} status={status} />
            <LocationCard profile={profile} whatsappHref={whatsappHref} />
          </div>
        </Container>
      </section>
    </>
  );
}
