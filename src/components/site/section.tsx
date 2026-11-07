import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Largura e respiro lateral padrão do site público. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

/** Bloco de página interna (preços, contato, agendamento...). */
export function PageShell({ title, description, eyebrow, children, narrow = false }: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <>
      <div className="relative overflow-hidden bg-navy-950 text-white">
        <WaveBackdrop />
        <Container className={cn("relative py-10 sm:py-14", narrow && "max-w-3xl")}>
          {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.2em] text-aqua-400">{eyebrow}</p>}
          <h1 className="type-section mt-2">{title}</h1>
          {description && <p className="mt-3 max-w-2xl text-base text-white/75">{description}</p>}
        </Container>
      </div>
      <Container className={cn("py-8 sm:py-12", narrow && "max-w-3xl")}>{children}</Container>
    </>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  id,
  align = "left",
  onDark = false,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  id?: string;
  align?: "left" | "center";
  onDark?: boolean;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && (
        <p className={cn("text-xs font-bold uppercase tracking-[0.2em]", onDark ? "text-aqua-400" : "text-ocean-600")}>{eyebrow}</p>
      )}
      <h2 id={id} className={cn("type-section mt-2", onDark ? "text-white" : "text-navy-950")}>
        {title}
      </h2>
      {description && <p className={cn("mt-3 text-base", onDark ? "text-white/75" : "text-muted")}>{description}</p>}
    </div>
  );
}

/** Ondas e brilho discretos para fundos azul-marinho. Puramente decorativo. */
export function WaveBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute -right-32 -top-40 size-[34rem] rounded-full bg-ocean-600/25 blur-3xl" />
      <div className="absolute -bottom-48 -left-24 size-[28rem] rounded-full bg-aqua-400/10 blur-3xl" />
      <svg className="absolute inset-x-0 bottom-0 h-24 w-full text-white/[0.04]" viewBox="0 0 1440 120" preserveAspectRatio="none">
        <path fill="currentColor" d="M0 64c120-21 240-32 360-21s240 43 360 43 240-32 360-43 240 0 360 21v56H0Z" />
        <path fill="currentColor" d="M0 92c160-16 320-24 480-14s320 30 480 30 320-14 480-26v38H0Z" />
      </svg>
    </div>
  );
}
