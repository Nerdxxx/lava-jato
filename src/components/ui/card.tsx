import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-sm", className)} {...props} />
  );
}

const BADGE_TONES = {
  neutral: "bg-bg text-muted border-line",
  info: "bg-aqua-400/15 text-ocean-600 border-aqua-400/40",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-sun-400/20 text-navy-950 border-sun-400/60",
  danger: "bg-danger/10 text-danger border-danger/30",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", BADGE_TONES[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line p-8 text-center">
      <p className="font-semibold">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
    </div>
  );
}
