import Link from "next/link";
import { Plus, Sparkles, SprayCan } from "lucide-react";
import { formatBRL } from "@/lib/utils";
import type { Addon } from "@/modules/scheduling/addons";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/modules/scheduling/labels";
import { Container, SectionHeading, WaveBackdrop } from "./section";

const ICONS = [Sparkles, SprayCan];

function categoriesNote(cats: string[]): string | null {
  const all = CATEGORY_ORDER.filter((c) => cats.includes(c));
  if (all.length === CATEGORY_ORDER.length) return null;
  if (all.length === CATEGORY_ORDER.length - 1 && !all.includes("MOTO")) return "Disponível para carros.";
  return `Disponível para: ${all.map((c) => CATEGORY_LABEL[c]!.toLowerCase()).join(", ")}.`;
}

/** Só recebe adicionais ATIVOS. Eles podem ser escolhidos de verdade na etapa "Adicionais" do agendamento. */
export function AddonsSection({ addons }: { addons: Addon[] }) {
  if (addons.length === 0) return null;
  return (
    <section aria-labelledby="adicionais" className="relative overflow-hidden bg-navy-950 py-16 text-white sm:py-20">
      <WaveBackdrop />
      <Container className="relative">
        <SectionHeading
          id="adicionais"
          onDark
          eyebrow="Serviços adicionais"
          title="Dê um cuidado extra ao seu carro"
          description="Acrescente ao seu serviço na hora de agendar. O valor é somado ao total do agendamento."
        />
        <ul className="mt-10 grid gap-5 md:grid-cols-2">
          {addons.map((a, i) => {
            const Icon = ICONS[i % ICONS.length]!;
            const note = categoriesNote(a.categories);
            return (
              <li key={a.slug} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm sm:flex-row sm:items-start">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-aqua-400/15 text-aqua-400">
                  <Icon className="size-6" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-lg font-bold">{a.name}</h3>
                    <p className="flex items-center gap-0.5 text-xl font-extrabold text-sun-400">
                      <Plus className="size-4" strokeWidth={3} aria-hidden />
                      {formatBRL(a.priceCents)}
                    </p>
                  </div>
                  {a.description && <p className="mt-1.5 text-sm text-white/75">{a.description}</p>}
                  <p className="mt-2 text-xs text-white/60">Tempo adicional: {a.durationMinutes} min.</p>
                  {note && <p className="mt-2 text-xs text-white/55">{note}</p>}
                </div>
              </li>
            );
          })}
        </ul>
        <Link
          href="/agendar"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-sun-400 px-6 text-sm font-bold text-navy-950 transition hover:bg-sun-500 active:scale-[0.98]"
        >
          Agendar lavagem
        </Link>
      </Container>
    </section>
  );
}
