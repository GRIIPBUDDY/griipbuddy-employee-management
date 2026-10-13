import { CalendarCheck, ShieldCheck, Wallet } from "lucide-react";
/** Shared frame for unauthenticated and account-security pages. */
export function AuthFrame({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return <main id="main" className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
    <section className="relative hidden overflow-hidden bg-[#1d2d7a] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div aria-hidden="true" className="absolute inset-0 opacity-[.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" />
      <div className="relative flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18.5 19c-.3-1.6-1-2.9-2-3.8" /></svg></span><span className="text-lg font-semibold">GriipBuddy People</span></div>
      <div className="relative max-w-md space-y-8"><h2 className="text-3xl font-semibold leading-tight tracking-tight">Schedules, attendance and pay — in one calm workspace.</h2>
        <ul className="space-y-4 text-sm text-white/85">{[[CalendarCheck, "Recurring schedules with check-in validated against official server time."], [Wallet, "Reviewed weekly earnings and monthly salary in BDT with full history."], [ShieldCheck, "Role-based access, audited decisions and private documents."]].map(([Icon, text], i) => { const I = Icon as typeof ShieldCheck; return <li key={i} className="flex gap-3"><I size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-white" />{text as string}</li>; })}</ul></div>
      <p className="relative text-xs text-white/60">Internal system · authorized personnel only</p>
    </section>
    <section className="flex items-center justify-center px-5 py-12 sm:px-10"><div className="w-full max-w-sm">
      <p className="mb-8 flex items-center gap-2 font-semibold text-primary lg:hidden">GriipBuddy People</p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{description && <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>}
      <div className="mt-8">{children}</div>{footer && <div className="mt-8 border-t pt-6 text-sm text-muted-foreground">{footer}</div>}
    </div></section>
  </main>;
}
/** Centered full-page state for errors, denied access and missing records. */
export function StatePage({ code, title, description, children }: { code: string; title: string; description: string; children?: React.ReactNode }) {
  return <main id="main" className="grid min-h-dvh place-items-center bg-background px-5"><div className="max-w-md text-center"><p className="text-sm font-semibold text-primary">{code}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>{children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}</div></main>;
}
