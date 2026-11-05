import { Card, EmptyState } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "Painel" };

export default async function AdminHome() {
  const user = await requireStaff();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-navy-950">Olá, {user.name.split(" ")[0]}</h1>
      <Card>
        <EmptyState
          title="Nenhum dado operacional ainda"
          description="Agenda, fila e indicadores serão exibidos aqui quando os módulos das próximas fases forem concluídos."
        />
      </Card>
    </div>
  );
}
