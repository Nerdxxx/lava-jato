"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck, Menu, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SiteNavItem {
  href: string;
  label: string;
}

export function SiteBrand({ onDark = true }: { onDark?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="Lava Jato Capuã — página inicial">
      <Image src="/branding/logo-ljc.png" alt="" width={44} height={41} className="h-10 w-auto sm:h-11" priority />
      <span className={cn("flex flex-col leading-none", onDark ? "text-white" : "text-navy-950")}>
        <span className="text-[0.95rem] font-extrabold tracking-tight sm:text-base">Lava Jato</span>
        <span className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-sun-400">Capuã</span>
      </span>
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  if (href.includes("#")) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SiteHeader({ nav }: { nav: SiteNavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  // Menu aberto: trava a rolagem, foca o primeiro link, Esc fecha e o Tab fica preso no painel.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []).concat(
        toggleRef.current ? [toggleRef.current] : [],
      );
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const onResize = () => window.innerWidth >= 1024 && close(false);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  return (
    <header
      data-print-hide
      className={cn(
        "sticky top-0 z-40 border-b text-white transition-[background-color,box-shadow,border-color] duration-300",
        scrolled || open ? "border-white/10 bg-navy-950/95 shadow-lg shadow-navy-950/20 backdrop-blur" : "border-transparent bg-navy-950",
      )}
    >
      <div className={cn("mx-auto flex max-w-6xl items-center gap-3 px-4 transition-[height] duration-300 sm:px-6", scrolled ? "h-16" : "h-[4.5rem]")}>
        <div onClickCapture={() => setOpen(false)}>
          <SiteBrand />
        </div>

        <nav aria-label="Principal" className="mx-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {nav.map((i) => {
              const active = isActive(pathname, i.href);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10 hover:text-white",
                      active ? "text-aqua-400" : "text-white/80",
                    )}
                  >
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Link
            href="/cliente"
            className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white lg:inline-flex"
          >
            <UserRound className="size-4" aria-hidden />
            Minha conta
          </Link>
          <Link
            href="/agendar"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-sun-400 px-3.5 text-sm font-bold text-navy-950 shadow-sm transition hover:bg-sun-500 active:scale-[0.98] sm:px-4"
          >
            <CalendarCheck className="hidden size-4 sm:block" aria-hidden />
            <span className="sm:hidden">Agendar</span>
            <span className="hidden sm:inline">Agendar agora</span>
          </Link>
          <button
            ref={toggleRef}
            type="button"
            onClick={() => (open ? close() : setOpen(true))}
            aria-expanded={open}
            aria-controls="menu-principal"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            className="inline-flex size-10 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 lg:hidden"
          >
            {open ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <>
          <div className="fixed inset-x-0 bottom-0 top-16 z-30 animate-fade bg-navy-950/60 lg:hidden" onClick={() => close(false)} aria-hidden />
          <div
            id="menu-principal"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4rem)] animate-fade overflow-y-auto border-t border-white/10 bg-navy-950 px-4 pb-6 pt-2 shadow-2xl lg:hidden"
          >
            <nav aria-label="Menu principal">
              <ul className="divide-y divide-white/10">
                {nav.map((i) => (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={() => close(false)}
                      aria-current={isActive(pathname, i.href) ? "page" : undefined}
                      className="flex min-h-13 items-center text-base font-semibold text-white/90 hover:text-aqua-400 aria-[current=page]:text-aqua-400"
                    >
                      {i.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/cliente" onClick={() => close(false)} className="flex min-h-13 items-center gap-2 text-base font-semibold text-white/90 hover:text-aqua-400">
                    <UserRound className="size-5" aria-hidden />
                    Minha conta
                  </Link>
                </li>
              </ul>
            </nav>
            <Link
              href="/agendar"
              onClick={() => close(false)}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sun-400 text-base font-bold text-navy-950 hover:bg-sun-500"
            >
              <CalendarCheck className="size-5" aria-hidden />
              Agendar minha lavagem
            </Link>
          </div>
        </>
      )}
    </header>
  );
}
