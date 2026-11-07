import type { ReactNode } from "react";

/** Tipografia de textos longos (privacidade, termos). */
export function LegalText({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-3xl space-y-6 text-[0.95rem] leading-relaxed text-ink [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-navy-950 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
      {children}
    </div>
  );
}
