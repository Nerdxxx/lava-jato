import { Card, EmptyState } from "@/components/ui/card";

export const metadata = { title: "Meu painel" };

export default function CustomerHome() {
  return (
    <Card>
      <EmptyState
        title="Você ainda não tem agendamentos"
        description="Seus veículos, agendamentos e histórico aparecerão aqui."
      />
    </Card>
  );
}
