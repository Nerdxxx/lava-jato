import Link from "next/link";
import { Clock, MapPin, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayHours, OpenStatus } from "@/modules/business/hours";
import { formatPhoneBR, type BusinessProfile } from "@/modules/business/profile";
import { InstagramIcon, WhatsAppIcon } from "./brand-icons";

export function HoursCard({ hours, status }: { hours: DayHours[]; status: OpenStatus | null }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-lg font-bold text-navy-950">
          <span className="flex size-10 items-center justify-center rounded-xl bg-ocean-600/10 text-ocean-600">
            <Clock className="size-5" aria-hidden />
          </span>
          Horário de funcionamento
        </h3>
        {status && (
          <p
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold",
              status.open ? "bg-success/10 text-success" : "bg-bg text-muted",
            )}
          >
            <span className={cn("size-2 rounded-full", status.open ? "bg-success" : "bg-muted/60")} aria-hidden />
            {status.open ? "Aberto agora" : "Fechado agora"}
            {status.detail && <span className="font-medium">· {status.detail}</span>}
          </p>
        )}
      </div>
      <dl className="mt-5 divide-y divide-line">
        {hours.map((h) => {
          const today = status?.todayWeekday === h.weekday;
          return (
            <div key={h.day} className={cn("flex items-center justify-between gap-4 py-2.5 text-sm", today && "-mx-3 rounded-lg border-0 bg-sun-400/15 px-3")}>
              <dt className={cn("font-medium", today && "font-bold text-navy-950")}>
                {h.day}
                {today && <span className="ml-2 text-xs font-semibold text-ocean-600">hoje</span>}
              </dt>
              <dd className={cn("text-right tabular-nums", h.windows.length === 0 ? "text-muted" : "font-semibold text-navy-950")}>{h.hours}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/** Localização e contato: usa só os dados de Configurações → Dados do negócio. */
export function LocationCard({ profile, whatsappHref }: { profile: BusinessProfile; whatsappHref: string | null }) {
  return (
    <div className="flex flex-col rounded-2xl bg-navy-950 p-6 text-white shadow-sm">
      <h3 className="flex items-center gap-2.5 text-lg font-bold">
        <span className="flex size-10 items-center justify-center rounded-xl bg-aqua-400/15 text-aqua-400">
          <MapPin className="size-5" aria-hidden />
        </span>
        Onde estamos
      </h3>
      <p className="mt-5 text-xl font-extrabold">{profile.name}</p>
      {profile.address && <p className="mt-1 text-white/75">{profile.address}</p>}
      {profile.whatsapp && <p className="mt-3 text-sm text-white/75">WhatsApp {formatPhoneBR(profile.whatsapp)}</p>}
      <div className="mt-auto grid gap-2 pt-6 sm:grid-cols-2">
        {profile.mapsUrl && (
          <a
            href={profile.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sun-400 text-sm font-bold text-navy-950 transition hover:bg-sun-500"
          >
            <Navigation className="size-4" aria-hidden />
            Como chegar
          </a>
        )}
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-whatsapp text-sm font-bold text-white transition hover:opacity-90"
          >
            <WhatsAppIcon className="size-5" />
            WhatsApp
          </a>
        )}
        {profile.instagram && (
          <a
            href={`https://instagram.com/${profile.instagram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 text-sm font-bold transition hover:bg-white/10"
          >
            <InstagramIcon className="size-5" />@{profile.instagram}
          </a>
        )}
        <Link
          href="/agendar"
          className="flex min-h-12 items-center justify-center rounded-xl border border-white/20 text-sm font-bold transition hover:bg-white/10"
        >
          Agendar horário
        </Link>
      </div>
    </div>
  );
}
