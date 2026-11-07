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
  addonSlugs = [],
  excludeCode,
  phone,
  minDate,
  maxDate,
  value,
  onChange,
}: {
  serviceId: string;
  category: string;
  addonSlugs?: string[];
  excludeCode?: string;
  phone?: string;
  minDate: string;
  maxDate: string;
  value: string | null;
  onChange: (startsAt: string | null) => void;
}) {
  const [date, setDate] = useState(minDate);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addonKey = addonSlugs.join(",");
  const requestKey = `${serviceId}|${category}|${date}|${addonKey}|${excludeCode ?? ""}|${phone ?? ""}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/disponibilidade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId, category, date, addons: addonKey.split(",").filter(Boolean), excludeCode, phone }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as { slots?: Slot[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? "Não foi possível carregar os horários.");
        setSlots(body.slots ?? []);
        setError(null);
        setLoadedKey(requestKey);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Erro ao carregar horários.");
        setLoadedKey(requestKey);
      });
    return () => controller.abort();
  }, [serviceId, category, date, addonKey, excludeCode, phone, requestKey]);

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
          className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base font-medium sm:w-auto"
        />
      </div>
      <div aria-live="polite">
        {loadedKey === requestKey && error ? (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        ) : loadedKey !== requestKey || slots === null ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-busy="true">
            <span className="sr-only">Carregando horários...</span>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} aria-hidden className="h-12 animate-pulse rounded-xl bg-line/70" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">Sem horários livres nesta data. Tente outro dia.</p>
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
                  "min-h-12 rounded-xl border-2 text-sm font-bold tabular-nums transition active:scale-95",
                  value === s.startsAt ? "border-navy-950 bg-navy-950 text-white shadow-md" : "border-line bg-surface hover:border-ocean-600/60",
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
