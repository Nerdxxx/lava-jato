import { CalendarCheck, CarFront, ClipboardList, MonitorSmartphone } from "lucide-react";

const STEPS = [
  { icon: ClipboardList, title: "Escolha sua lavagem", text: "Selecione o veículo e o serviço." },
  { icon: CalendarCheck, title: "Reserve seu horário", text: "Escolha um horário realmente disponível." },
  { icon: CarFront, title: "Traga seu veículo", text: "Compareça no local no horário confirmado." },
  { icon: MonitorSmartphone, title: "Acompanhe o atendimento", text: "Consulte o status pelo site e saiba quando estiver pronto." },
];

export function HowItWorks() {
  return (
    <ol className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
      {/* linha de progressão (computador) */}
      <div aria-hidden className="absolute left-[12.5%] right-[12.5%] top-8 hidden h-0.5 bg-gradient-to-r from-ocean-600/30 via-aqua-400/60 to-sun-400/60 lg:block" />
      {STEPS.map((s, i) => (
        <li key={s.title} className="relative flex gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm lg:flex-col lg:items-center lg:border-0 lg:bg-transparent lg:p-0 lg:text-center lg:shadow-none">
          <span className="relative flex size-16 shrink-0 items-center justify-center rounded-2xl bg-navy-950 text-sun-400 shadow-lg shadow-navy-950/20 ring-4 ring-bg">
            <s.icon className="size-7" aria-hidden />
            <span className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-sun-400 text-xs font-extrabold text-navy-950 ring-2 ring-bg">
              {i + 1}
            </span>
          </span>
          <div>
            <h3 className="font-bold text-navy-950 lg:mt-4">{s.title}</h3>
            <p className="mt-1 text-sm text-muted">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
