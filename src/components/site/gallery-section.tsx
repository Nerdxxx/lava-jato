import Image from "next/image";
import { Camera, Droplets, Sparkles, SplitSquareHorizontal, type LucideIcon } from "lucide-react";
import { Container, SectionHeading } from "./section";

export interface GalleryPhoto {
  src: string;
  alt: string;
}

const PLACEHOLDERS: { icon: LucideIcon; label: string }[] = [
  { icon: SplitSquareHorizontal, label: "Antes e depois" },
  { icon: Droplets, label: "Aplicação da espuma" },
  { icon: Camera, label: "Limpeza de rodas" },
  { icon: Sparkles, label: "Acabamento final" },
];

/**
 * Espaço para fotos REAIS dos atendimentos. Enquanto não houver fotos publicadas, mostra um estado vazio
 * (nunca imagens de banco ou geradas por IA como se fossem resultado do lava jato).
 */
export function GallerySection({ photos = [] }: { photos?: GalleryPhoto[] }) {
  return (
    <section aria-labelledby="resultados" className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          id="resultados"
          eyebrow="Resultados"
          title="Cuidado que aparece nos detalhes"
          description={photos.length ? "Fotos de atendimentos feitos no Lava Jato Capuã." : "Em breve, fotos reais dos nossos atendimentos."}
        />
        {photos.length > 0 ? (
          <ul className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            {photos.map((p) => (
              <li key={p.src} className="relative aspect-square overflow-hidden rounded-2xl bg-bg">
                <Image src={p.src} alt={p.alt} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            {PLACEHOLDERS.map((p) => (
              <li
                key={p.label}
                className="flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-gradient-to-br from-surface to-bg p-4 text-center"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-ocean-600/10 text-ocean-600">
                  <p.icon className="size-6" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-navy-950">{p.label}</span>
                <span className="text-xs text-muted">foto em breve</span>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}
