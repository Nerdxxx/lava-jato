import Link from "next/link";
import { getDb } from "@/db/client";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOpeningHours } from "@/modules/business/hours";
import { formatPhoneBR, loadProfile } from "@/modules/business/profile";
import { waLink } from "@/modules/notifications/whatsapp";

export const metadata = { title: "Contato" };
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const db = await getDb();
  const [profile, hours] = await Promise.all([loadProfile(db), getOpeningHours(db)]);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-extrabold text-navy-950">Contato</h1>
      <Card className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-bold">{profile.name}</h2>
          <p className="text-sm">{profile.address}</p>
          {profile.whatsapp && <p className="text-sm">WhatsApp: {formatPhoneBR(profile.whatsapp)}</p>}
          {profile.instagram && (
            <p className="text-sm">
              Instagram:{" "}
              <a href={`https://instagram.com/${profile.instagram}`} target="_blank" rel="noopener noreferrer" className="underline">
                @{profile.instagram}
              </a>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {profile.whatsapp && (
            <a href={waLink(profile.whatsapp, "Olá! Vim pelo site do lava jato.")} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
              Chamar no WhatsApp
            </a>
          )}
          {profile.mapsUrl && (
            <a href={profile.mapsUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
              Como chegar
            </a>
          )}
          <Link href="/agendar" className={buttonVariants({ variant: "outline" })}>
            Agendar lavagem
          </Link>
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">Horário de funcionamento</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          {hours.map((h) => (
            <div key={h.day} className="contents">
              <dt className="font-medium">{h.day}</dt>
              <dd className={h.hours === "Fechado" ? "text-muted" : ""}>{h.hours}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
