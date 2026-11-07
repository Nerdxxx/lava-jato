import { getDb } from "@/db/client";
import { PageShell } from "@/components/site/section";
import { HoursCard, LocationCard } from "@/components/site/visit-section";
import { getOpenStatus, getOpeningHours } from "@/modules/business/hours";
import { loadProfile } from "@/modules/business/profile";
import { waLink } from "@/modules/notifications/whatsapp";

export const metadata = {
  title: "Contato e localização",
  description: "Endereço, horário de funcionamento e WhatsApp do Lava Jato Capuã, em Barra dos Coqueiros — SE.",
};
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const db = await getDb();
  const [profile, hours] = await Promise.all([loadProfile(db), getOpeningHours(db)]);
  const status = await getOpenStatus(db, hours);
  const whatsappHref = profile.whatsapp ? waLink(profile.whatsapp, "Olá! Vim pelo site do lava jato.") : null;
  return (
    <PageShell eyebrow="Contato" title="Fale com a gente" description="Tire dúvidas, combine um horário ou venha conhecer o lava jato.">
      <div className="grid gap-5 lg:grid-cols-2">
        <LocationCard profile={profile} whatsappHref={whatsappHref} />
        <HoursCard hours={hours} status={status} />
      </div>
    </PageShell>
  );
}
