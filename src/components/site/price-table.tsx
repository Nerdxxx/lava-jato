import Link from "next/link";
import { ArrowRight, Bike, Car, CarFront, Truck } from "lucide-react";
import { formatBRL } from "@/lib/utils";
import type { Addon } from "@/modules/scheduling/addons";
import type { CatalogService } from "@/modules/scheduling/catalog";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/modules/scheduling/labels";
import { bookingHref } from "./offers";

const CATEGORY_ICON: Record<string, typeof Car> = { MOTO: Bike, CARRO_PEQUENO: Car, CARRO_MEDIO: Car, SUV: CarFront, PICAPE: Truck };

function Unavailable() {
  return (
    <span className="text-sm font-medium text-muted">
      <span aria-hidden>—</span>
      <span className="sr-only">Não disponível</span>
    </span>
  );
}

/** Tabela de preços vinda do banco: tabela no computador, cards por veículo no celular (sem rolagem lateral). */
export function PriceTable({ catalog, addons }: { catalog: CatalogService[]; addons: Addon[] }) {
  const rows = CATEGORY_ORDER.filter((c) => catalog.some((s) => typeof s.prices[c] === "number"));
  return (
    <div className="space-y-6">
      {/* computador / tablet */}
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-sm md:block">
        <table className="w-full text-left">
          <caption className="sr-only">Preços por tipo de veículo e serviço</caption>
          <thead className="bg-navy-950 text-white">
            <tr>
              <th scope="col" className="px-6 py-4 text-sm font-semibold">
                Veículo
              </th>
              {catalog.map((s) => (
                <th key={s.id} scope="col" className="px-6 py-4 text-sm font-semibold">
                  {s.name}
                  <span className="block text-xs font-normal text-white/60">duração conforme o veículo</span>
                </th>
              ))}
              <th scope="col" className="px-6 py-4">
                <span className="sr-only">Agendar</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => {
              const Icon = CATEGORY_ICON[c] ?? Car;
              return (
                <tr key={c} className="transition-colors hover:bg-bg">
                  <th scope="row" className="px-6 py-4">
                    <span className="flex items-center gap-3 font-semibold text-navy-950">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-ocean-600/10 text-ocean-600">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      {CATEGORY_LABEL[c]}
                    </span>
                  </th>
                  {catalog.map((s) => (
                    <td key={s.id} className="px-6 py-4">
                      {typeof s.prices[c] === "number" ? (
                        <span className="block">
                          <span className="text-lg font-extrabold tracking-tight text-navy-950">{formatBRL(s.prices[c]!)}</span>
                          <span className="block text-xs text-muted">{s.durations[c] ?? s.durationMinutes} min</span>
                        </span>
                      ) : (
                        <Unavailable />
                      )}
                    </td>
                  ))}
                  <td className="px-6 py-4 text-right">
                    <Link href={bookingHref(undefined, c)} className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-600 hover:underline">
                      Agendar <ArrowRight className="size-4" aria-hidden />
                      <span className="sr-only">para {CATEGORY_LABEL[c]}</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* celular */}
      <ul className="grid gap-3 md:hidden">
        {rows.map((c) => {
          const Icon = CATEGORY_ICON[c] ?? Car;
          return (
            <li key={c} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-3 font-bold text-navy-950">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-ocean-600/10 text-ocean-600">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {CATEGORY_LABEL[c]}
                </h3>
                <Link
                  href={bookingHref(undefined, c)}
                  className="inline-flex min-h-10 items-center rounded-lg bg-navy-950 px-3 text-sm font-semibold text-white"
                >
                  Agendar
                  <span className="sr-only"> para {CATEGORY_LABEL[c]}</span>
                </Link>
              </div>
              <dl className="mt-3 divide-y divide-line border-t border-line">
                {catalog.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="text-sm text-muted">{s.name}</dt>
                    <dd>
                      {typeof s.prices[c] === "number" ? (
                        <span className="block">
                          <span className="text-base font-extrabold text-navy-950">{formatBRL(s.prices[c]!)}</span>
                          <span className="block text-right text-xs text-muted">{s.durations[c] ?? s.durationMinutes} min</span>
                        </span>
                      ) : (
                        <Unavailable />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>

      {addons.length > 0 && (
        <div className="rounded-2xl border border-dashed border-ocean-600/40 bg-ocean-600/[0.04] p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-ocean-600">Adicionais</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {addons.map((a) => (
              <li key={a.slug} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{a.name}</span>
                <span className="shrink-0 text-right font-extrabold text-navy-950">+ {formatBRL(a.priceCents)}<span className="block text-xs font-normal text-muted">+ {a.durationMinutes} min</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
