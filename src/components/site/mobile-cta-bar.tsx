"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "./brand-icons";

/**
 * Barra inferior de agendamento (só no celular). Aparece depois que o visitante rola a página — quando o botão do
 * topo já saiu da tela — e some nas páginas do próprio agendamento. O layout reserva o espaço dela no fim da página.
 */
export function MobileCtaBar({ whatsappHref }: { whatsappHref: string | null }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const hidden = pathname.startsWith("/agendar") || pathname.startsWith("/agendamento");

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (hidden) return null;
  return (
    <div
      data-print-hide
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-navy-950/95 px-4 pt-3 pb-safe backdrop-blur transition-transform duration-300 lg:hidden",
        visible ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
      aria-hidden={!visible}
    >
      <div className="mx-auto flex max-w-md gap-2">
        <Link
          href="/agendar"
          tabIndex={visible ? undefined : -1}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-sun-400 text-base font-bold text-navy-950 active:scale-[0.98]"
        >
          <CalendarCheck className="size-5" aria-hidden />
          Agendar lavagem
        </Link>
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={visible ? undefined : -1}
            aria-label="Falar no WhatsApp"
            className="flex size-12 items-center justify-center rounded-xl bg-whatsapp text-white active:scale-[0.98]"
          >
            <WhatsAppIcon className="size-6" />
          </a>
        )}
      </div>
    </div>
  );
}
