import Link from "next/link";
import { ArrowRight, Bike, Car, CarFront, Check, Clock } from "lucide-react";
import { formatBRL, cn } from "@/lib/utils";
import { bookingHref, type Offer } from "./offers";

/** Destaca o serviço de carro com mais itens incluídos (fato verificável, sem rótulo de "mais vendido"). */
function featuredKey(offers: Offer[]): string | null {
  const cars = offers.filter((o) => o.kind === "car");
  if (cars.length < 2) return null;
  return cars.reduce((a, b) => (b.includes.length > a.includes.length ? b : a)).key;
}

export function ServiceCards({ offers }: { offers: Offer[] }) {
  const featured = featuredKey(offers);
  return (
    <ul className={cn("grid gap-5", offers.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2")}>
      {offers.map((o) => {
        const isFeatured = o.key === featured;
        const Icon = o.kind === "moto" ? Bike : isFeatured ? CarFront : Car;
        return (
          <li
            key={o.key}
            className={cn(
              "group relative flex flex-col rounded-2xl border bg-surface p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl",
              isFeatured ? "border-sun-400 shadow-sun-400/10 ring-1 ring-sun-400/60" : "border-line hover:border-ocean-600/40",
            )}
          >
            {isFeatured && (
              <span className="absolute -top-3 left-6 rounded-full bg-sun-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-navy-950">
                Mais completa
              </span>
            )}
            <div className="flex items-start justify-between gap-4">
              <span
                className={cn(
                  "flex size-12 items-center justify-center rounded-xl",
                  isFeatured ? "bg-navy-950 text-sun-400" : "bg-ocean-600/10 text-ocean-600",
                )}
              >
                <Icon className="size-6" aria-hidden />
              </span>
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Clock className="size-3.5" aria-hidden />
                cerca de {o.durationMinutes} min
              </p>
            </div>
            <h3 className="mt-5 text-xl font-extrabold tracking-tight text-navy-950">{o.title}</h3>
            {o.description && <p className="mt-1.5 text-sm text-muted">{o.description}</p>}
            <p className="mt-4 flex items-baseline gap-1.5 text-navy-950">
              {o.varies && <span className="text-sm font-medium text-muted">a partir de</span>}
              <span className="text-3xl font-extrabold tracking-tight">{formatBRL(o.minCents)}</span>
            </p>
            {o.varies && <p className="text-xs text-muted">O valor final depende do tipo de veículo.</p>}
            <details className="mt-5 border-t border-line pt-4 text-sm">
              <summary className="w-fit cursor-pointer font-semibold text-ocean-600">Ver itens incluídos ({o.includes.length})</summary>
              <ul className="mt-3 space-y-2">
                {o.includes.map((i) => (
                  <li key={i} className="flex gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-ocean-600" strokeWidth={3} aria-hidden />
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </details>
            {o.excludes.length > 0 && <p className="mt-3 text-xs text-muted">Não inclui: {o.excludes.join(", ").toLowerCase()}.</p>}
            <div className="mt-auto pt-6">
              <Link
                href={bookingHref(o.serviceId, o.category)}
                className={cn(
                  "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition active:scale-[0.98]",
                  isFeatured ? "bg-sun-400 text-navy-950 hover:bg-sun-500" : "bg-navy-950 text-white hover:bg-navy-800",
                )}
              >
                Agendar {o.kind === "moto" ? "lavagem da moto" : o.title.toLowerCase()}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
