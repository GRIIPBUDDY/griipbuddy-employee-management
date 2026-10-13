"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
/** Multi-select for bulk assignment. Each checked employee receives an independent assignment. */
export function EmployeePicker({ employees, name = "employeeIds" }: { employees: { id: string; legalName: string; employeeNumber?: string }[]; name?: string }) {
  const [query, setQuery] = useState(""), [selected, setSelected] = useState<Set<string>>(new Set());
  const visible = useMemo(() => employees.filter(e => `${e.legalName} ${e.employeeNumber ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())), [employees, query]);
  const toggle = (id: string, on: boolean) => setSelected(current => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; });
  const allVisible = visible.length > 0 && visible.every(e => selected.has(e.id));
  return <fieldset className="space-y-2"><legend className="text-sm font-medium">Assign to <span className="text-danger" aria-hidden="true">*</span></legend>
    <div className="flex flex-wrap items-center gap-2"><label className="relative min-w-48 flex-1"><span className="sr-only">Search employees</span><Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search employees" className="h-9 w-full rounded-lg border border-input bg-surface pl-8 pr-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15" /></label>
      <button type="button" className="h-9 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary-soft" onClick={() => setSelected(current => { const next = new Set(current); visible.forEach(e => allVisible ? next.delete(e.id) : next.add(e.id)); return next; })}>{allVisible ? "Clear visible" : "Select visible"}</button>
      <span className="text-xs text-muted-foreground" aria-live="polite">{selected.size} selected</span></div>
    <div className="max-h-56 overflow-y-auto rounded-lg border">{employees.map(e => { const hidden = !visible.includes(e); return <label key={e.id} hidden={hidden} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-subtle"><input type="checkbox" name={name} value={e.id} checked={selected.has(e.id)} onChange={event => toggle(e.id, event.target.checked)} /><span className="font-medium">{e.legalName}</span>{e.employeeNumber && <span className="ml-auto text-xs text-muted-foreground">{e.employeeNumber}</span>}</label>; })}
      {!visible.length && <p className="px-3 py-4 text-center text-sm text-muted-foreground">No employees match “{query}”.</p>}</div>
    <p className="text-xs text-muted-foreground">Only active employees with active accounts can receive tasks. Each person gets a separate assignment and completes it independently.</p>
  </fieldset>;
}
