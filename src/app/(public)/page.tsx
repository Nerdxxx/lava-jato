import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { getOpeningHours } from "@/modules/business/hours";
import { loadProfile } from "@/modules/business/profile";
import { loadLoyaltyConfig } from "@/modules/loyalty/loyalty";
import { getCatalog } from "@/modules/scheduling/catalog";

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Escolha o serviço", text: "Veículo, tipo de lavagem e o horário livre que for melhor para você." },
  { title: "Traga o veículo", text: "Você recebe a confirmação pelo WhatsApp. É só chegar no horário marcado." },
  { title: "Acompanhe e retire", text: "Veja o andamento pelo site e receba o aviso quando estiver pronto." },
];

export default async function HomePage() {
  const db = await getDb();
  const [catalog, hours, profile, loyalty] = await Promise.all([getCatalog(db), getOpeningHours(db), loadProfile(db), loadLoyaltyConfig(db)]);

  return (
    <div className="space-y-14">
      <section className="grid items-center gap-8 md:grid-cols-2">
        <div className="space-y-5">
          <h1 className="text-3xl font-extrabold leading-tight text-navy-950 sm:text-4xl">Seu carro limpo, do jeito que o Capuã merece.</h1>
          <p className="text-muted">
            Lavagem externa, lavagem completa com limpeza interna básica e lavagem de motos, em Barra dos Coqueiros. Agende pelo celular em menos de
            um minuto.
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
        <Image src="/branding/logo-ljc.png" alt="Logo do Lava Jato Capuã" width={520} height={480} className="mx-auto h-auto w-full max-w-sm" priority />
      </section>

      {catalog.length > 0 && (
        <section className="space-y-4" aria-labelledby="servicos">
          <h2 id="servicos" className="text-2xl font-extrabold text-navy-950">
            Serviços
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {catalog.map((s) => {
              const values = Object.values(s.prices).filter((v): v is number => typeof v === "number");
              return (
                <Card key={s.id} className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-lg font-bold">{s.name}</h3>
                    {values.length > 0 && <span className="text-sm text-muted">a partir de {formatBRL(Math.min(...values))}</span>}
                  </div>
                  <ul className="list-inside list-disc text-sm text-muted">
                    {s.includes.slice(0, 6).map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted">Duração média: {s.durationMinutes} min</p>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-4" aria-labelledby="como">
        <h2 id="como" className="text-2xl font-extrabold text-navy-950">
          Como funciona
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full space-y-2">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-sun-400 font-extrabold text-navy-950">{i + 1}</span>
                <h3 className="font-bold">{s.title}</h3>
                <p className="text-sm text-muted">{s.text}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {loyalty.enabled && (
        <section>
          <Card className="flex flex-wrap items-center justify-between gap-4 bg-navy-950 text-white">
            <div>
              <h2 className="text-xl font-extrabold">Cliente fiel ganha</h2>
              <p className="text-white/80">
                A cada {loyalty.visitsRequired} lavagens, você ganha {loyalty.rewardPercent === 100 ? "uma lavagem grátis" : `${loyalty.rewardPercent}% de desconto`}.
                Crie sua conta para acompanhar seus pontos.
              </p>
            </div>
            <Link href="/cadastro" className={buttonVariants()}>
              Criar conta
            </Link>
          </Card>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2" aria-labelledby="horarios">
        <Card className="space-y-3">
          <h2 id="horarios" className="text-xl font-extrabold text-navy-950">
            Horário de funcionamento
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            {hours.map((h) => (
              <div key={h.day} className="contents">
                <dt className="font-medium">{h.day}</dt>
                <dd className={h.hours === "Fechado" ? "text-muted" : ""}>{h.hours}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="space-y-3">
          <h2 className="text-xl font-extrabold text-navy-950">Onde estamos</h2>
          <p className="text-sm">{profile.address}</p>
          <div className="flex flex-wrap gap-2">
            {profile.mapsUrl && (
              <a href={profile.mapsUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
                Abrir no mapa
              </a>
            )}
            <Link href="/contato" className={buttonVariants({ variant: "outline" })}>
              Contato
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
