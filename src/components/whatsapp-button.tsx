import { cn } from "@/lib/utils";
import { buttonVariants } from "./ui/button";

/** Botão que gera a mensagem padrão no servidor e abre o WhatsApp numa nova aba. */
export function WhatsAppButton({
  kind,
  id,
  template,
  label,
  className,
}: {
  kind: "os" | "agendamento";
  id: string;
  template: string;
  label: string;
  className?: string;
}) {
  return (
    <form action="/api/whatsapp" method="post" target="_blank" rel="noopener">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="template" value={template} />
      <button type="submit" className={cn(buttonVariants({ variant: "outline" }), "min-h-9 px-3", className)}>
        <span aria-hidden>💬</span> {label}
      </button>
    </form>
  );
}
