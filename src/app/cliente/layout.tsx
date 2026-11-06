import { Shell } from "@/components/layout/shell";
import { requireCustomer } from "@/lib/auth";

const NAV = [
  { href: "/cliente", label: "Meu painel" },
  { href: "/agendar", label: "Agendar lavagem" },
  { href: "/cliente/conta", label: "Minha conta" },
];

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  return (
    <Shell nav={NAV} userName={user.name} roleLabel="Cliente">
      {children}
    </Shell>
  );
}
