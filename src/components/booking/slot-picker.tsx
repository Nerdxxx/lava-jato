"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Slot {
  startsAt: string;
  label: string;
}

/** Escolha de data e horário. Os horários vêm sempre do servidor (/api/disponibilidade). */
export function SlotPicker({
  serviceId,
  category,
  minDate,
  maxDate,
  value,
  onChange,
}: {
  serviceId: string;
  category: string;
  minDate: string;
  maxDate: string;
  value: string | null;
  onChange: (startsAt: string | null) => void;
}) {
  const [date, setDate] = useState(minDate);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/disponibilidade?${new URLSearchParams({ serviceId, category, date })}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as { slots?: Slot[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? "Não foi possível carregar os horários.");
        setSlots(body.slots ?? []);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Erro ao carregar horários.");
      });
    return () => controller.abort();
  }, [serviceId, category, date]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="slot-date" className="block text-sm font-medium">
          Data
        </label>
        <input
          id="slot-date"
          type="date"
          min={minDate}
          max={maxDate}
          value={date}
          onChange={(e) => {
            if (!e.target.value) return;
            setSlots(null);
            setError(null);
            onChange(null);
            setDate(e.target.value);
          }}
          className="min-h-11 rounded-lg border border-line bg-surface px-3"
        />
      </div>
      <div aria-live="polite">
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : slots === null ? (
          <p className="text-sm text-muted">Carregando horários...</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted">Sem horários livres nesta data. Tente outro dia.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Horários disponíveis">
            {slots.map((s) => (
              <button
                key={s.startsAt}
                type="button"
                role="radio"
                aria-checked={value === s.startsAt}
                onClick={() => onChange(s.startsAt)}
                className={cn(
                  "min-h-11 rounded-lg border text-sm font-semibold",
                  value === s.startsAt ? "border-navy-950 bg-navy-950 text-white" : "border-line bg-surface hover:bg-bg",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
