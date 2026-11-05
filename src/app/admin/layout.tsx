import { Shell } from "@/components/layout/shell";
import { requireStaff } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/permissions";

const ROLE_LABEL = {
  ADMINISTRADOR: "Administrador",
  FUNCIONARIO: "Funcionário",
  ATENDENTE: "Atendente",
  CLIENTE: "Cliente",
} as const;

// Apenas módulos já implementados aparecem no menu.
const NAV: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin", label: "Início", permission: "agenda:ver" },
  { href: "/admin/agenda", label: "Agenda", permission: "agenda:ver" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const nav = NAV.filter((i) => hasPermission(user.role, i.permission));
  return (
    <Shell nav={nav} userName={user.name} roleLabel={ROLE_LABEL[user.role]}>
      {children}
    </Shell>
  );
}
