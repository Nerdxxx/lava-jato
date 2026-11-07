import { getDb } from "@/db/client";
import { LegalText } from "@/components/site/legal";
import { PageShell } from "@/components/site/section";
import { formatPhoneBR, loadProfile } from "@/modules/business/profile";

export const metadata = { title: "Política de privacidade" };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const profile = await loadProfile(await getDb());
  return (
    <PageShell eyebrow="LGPD" title="Política de privacidade" description="Como o site do Lava Jato Capuã usa os seus dados.">
      <LegalText>
        <p>
          Esta política explica quais dados pessoais o {profile.name} coleta pelo site, para que eles são usados e como você pode exercer os seus
          direitos previstos na Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
        </p>
        <h2>Dados que coletamos</h2>
        <ul>
          <li>Nome e número de WhatsApp, informados ao agendar ou criar uma conta.</li>
          <li>E-mail e senha (guardada de forma criptografada), se você criar uma conta.</li>
          <li>Modelo, categoria e, se informada, placa do veículo.</li>
          <li>Histórico de agendamentos, atendimentos, pagamentos e pontos de fidelidade.</li>
          <li>Fotos do veículo tiradas durante o atendimento, quando houver.</li>
        </ul>
        <h2>Para que usamos</h2>
        <ul>
          <li>Organizar a agenda, confirmar horários e realizar o atendimento.</li>
          <li>Entrar em contato pelo WhatsApp sobre o seu agendamento ou veículo.</li>
          <li>Mostrar o andamento do serviço e o histórico na sua conta.</li>
          <li>Enviar promoções, somente se você autorizar no cadastro.</li>
        </ul>
        <h2>Compartilhamento</h2>
        <p>Não vendemos seus dados. Eles são acessados apenas pela equipe do lava jato, cada pessoa com permissões de acordo com a função.</p>
        <h2>Cookies</h2>
        <p>
          O site usa apenas cookies necessários para funcionar: manter você conectado à sua conta e lembrar o agendamento que acabou de fazer. Não
          usamos cookies de publicidade.
        </p>
        <h2>Seus direitos</h2>
        <p>
          Você pode pedir a qualquer momento acesso, correção ou exclusão dos seus dados, ou cancelar a autorização para promoções
          {profile.whatsapp ? `, pelo WhatsApp ${formatPhoneBR(profile.whatsapp)}` : ", falando com a equipe no local"}. Alguns registros
          financeiros podem precisar ser mantidos pelo prazo exigido em lei.
        </p>
      </LegalText>
    </PageShell>
  );
}
