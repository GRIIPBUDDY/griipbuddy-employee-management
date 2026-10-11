import { Inbox } from "lucide-react";
export function EmptyState({title, description, children}: {title: string; description?: string; children?: React.ReactNode}) {
  return <div className="rounded-xl border border-dashed bg-slate-50/60 px-6 py-10 text-center"><Inbox aria-hidden="true" className="mx-auto mb-3 text-slate-400" size={24}/><p className="font-semibold text-slate-800">{title}</p>{description&&<p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>}{children&&<div className="mt-4">{children}</div>}</div>;
}
