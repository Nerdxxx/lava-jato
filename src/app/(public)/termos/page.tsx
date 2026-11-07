import { getDb } from "@/db/client";
import { LegalText } from "@/components/site/legal";
import { PageShell } from "@/components/site/section";
import { loadProfile } from "@/modules/business/profile";
import { loadSettings } from "@/modules/scheduling/settings";

export const metadata = { title: "Termos de uso" };
export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const db = await getDb();
  const [profile, settings] = await Promise.all([loadProfile(db), loadSettings(db)]);
  return (
    <PageShell eyebrow="Termos" title="Termos de uso" description="Regras do agendamento online e dos serviços.">
      <LegalText>
        <h2>Agendamento</h2>
        <ul>
          <li>Os horários exibidos são os realmente livres no momento da consulta. A reserva só é garantida após a confirmação do lava jato.</li>
          <li>Você pode consultar, reagendar ou cancelar pelo site com o código do agendamento e o seu WhatsApp, até {settings.cancelDeadlineHours} hora(s) antes do horário marcado.</li>
          <li>Em caso de atraso ou não comparecimento, o horário pode ser liberado para outro cliente.</li>
        </ul>
        <h2>Preços e pagamento</h2>
        <ul>
          <li>O valor depende do tipo de veículo e dos adicionais escolhidos, e é calculado pelo sistema no momento do agendamento.</li>
          <li>O pagamento é feito no local, no dia do atendimento.</li>
          <li>Alterações na tabela de preços não afetam agendamentos já feitos.</li>
        </ul>
        <h2>Serviços</h2>
        <ul>
          <li>A lavagem completa inclui limpeza interna básica e não inclui higienização profunda.</li>
          <li>Tratamentos como a remoção de manchas nos vidros têm resultado que depende do tipo e do estado da mancha; não há garantia de remoção total.</li>
          <li>Retire objetos de valor do veículo antes do atendimento.</li>
        </ul>
        <h2>Contato</h2>
        <p>
          Dúvidas sobre estes termos podem ser tiradas diretamente com o {profile.name}
          {profile.address ? `, ${profile.address}` : ""}.
        </p>
      </LegalText>
    </PageShell>
  );
}
