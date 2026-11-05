import { Shell } from "@/components/layout/shell";
import { requireCustomer } from "@/lib/auth";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  return (
    <Shell nav={[{ href: "/cliente", label: "Meu painel" }]} userName={user.name} roleLabel="Cliente">
      {children}
    </Shell>
  );
}
