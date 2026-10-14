import { CalendarCheck, ShieldCheck, Wallet } from "lucide-react";
import { branding } from "@/features/settings/organization";
/** Shared frame for unauthenticated and account-security pages. */
export async function AuthFrame({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const brand = await branding(), logo = `/brand/logo?v=${brand.logoRevision}`;
  return <main id="main" className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
    <section className="relative hidden overflow-hidden bg-[var(--brand-panel)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div aria-hidden="true" className="absolute inset-0 opacity-[.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" />
      <div className="relative flex items-center gap-3"><img src={logo} alt="" width={44} height={44} className="h-11 w-11 rounded-xl" /><span><span className="block text-base font-semibold">{brand.companyName}</span><span className="block text-xs text-white/70">Employee workspace</span></span></div>
      <div className="relative max-w-md space-y-8"><h2 className="text-3xl font-semibold leading-tight tracking-tight">Schedules, attendance and pay — in one calm workspace.</h2>
        <ul className="space-y-4 text-sm text-white/85">{[[CalendarCheck, "Recurring schedules with check-in validated against official server time."], [Wallet, "Monthly salary from reviewed attendance, with payslips and full history."], [ShieldCheck, "Role-based access, audited decisions and private documents."]].map(([Icon, text], i) => { const I = Icon as typeof ShieldCheck; return <li key={i} className="flex gap-3"><I size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-white" />{text as string}</li>; })}</ul></div>
      <p className="relative text-xs text-white/60">Internal system · authorized personnel only</p>
    </section>
    <section className="flex items-center justify-center px-5 py-12 sm:px-10"><div className="w-full max-w-sm">
      <p className="mb-8 flex items-center gap-2.5 font-semibold text-primary lg:hidden"><img src={logo} alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />{brand.companyName}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{description && <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>}
      <div className="mt-8">{children}</div>{footer && <div className="mt-8 border-t pt-6 text-sm text-muted-foreground">{footer}</div>}
    </div></section>
  </main>;
}
