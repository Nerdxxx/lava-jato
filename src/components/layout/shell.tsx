import Link from "next/link";
import { logoutAction } from "@/app/(auth)/entrar/actions";
import { Button } from "@/components/ui/button";
import { Brand } from "./brand";

export interface NavItem {
  href: string;
  label: string;
}

export function Shell({
  nav,
  userName,
  roleLabel,
  children,
}: {
  nav: NavItem[];
  userName: string;
  roleLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="bg-navy-950 text-white md:sticky md:top-0 md:h-dvh">
        <div className="flex items-center justify-between p-4 md:block">
          <Brand light />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3" aria-label="Principal">
          {nav.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/10"
            >
              {i.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <p className="text-sm">
            <span className="font-semibold">{userName}</span> <span className="text-muted">· {roleLabel}</span>
          </p>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" className="min-h-9 px-3">
              Sair
            </Button>
          </form>
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
