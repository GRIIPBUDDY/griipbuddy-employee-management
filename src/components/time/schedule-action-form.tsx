"use client";
import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, FieldGrid } from "@/components/ui/field";
import { publishAction } from "@/features/time/actions";
import { addDays } from "@/features/time/dates";
import { rangeLabel } from "@/lib/utils/date-range";
/** Effective dates for a new assignment or an explicit replacement. End dates submitted to the server stay exclusive; the UI shows the last working date. */
export function ScheduleActionForm({ children, headerFields, from, until = "", timezone, baseFrom, baseUntil, submitLabel }: { children: React.ReactNode; headerFields: React.ReactNode; from: string; until?: string; timezone: string; baseFrom?: string; baseUntil?: string; submitLabel: string }) {
  const [range, setRange] = useState({ from, until, duration: "INDEFINITE", scope: "FUTURE" });
  const replacement = baseFrom !== undefined, start = replacement && range.scope === "SERIES" ? baseFrom : range.from;
  let end = range.until;
  const automaticEnd = replacement ? range.scope !== "CUSTOM" : range.duration !== "CUSTOM";
  try { if (!replacement && range.duration === "INDEFINITE") end = ""; else if (!replacement && range.duration === "WEEK") end = addDays(start, 7); else if (replacement && (range.scope === "FUTURE" || range.scope === "SERIES")) end = baseUntil ?? ""; else if (replacement && range.scope === "OCCURRENCE") end = addDays(start, 1); } catch { end = ""; }
  const last = (() => { try { return end ? addDays(end, -1) : ""; } catch { return ""; } })();
  const summary = start ? end ? last >= start ? `${rangeLabel(start, last)} (last working date ${last})` : "End must follow the start date" : `From ${rangeLabel(start, start)}, repeating every week with no end date` : "Choose a start date";
  return <ActionForm action={publishAction} submitLabel={submitLabel} submitIcon={<CalendarCheck size={16} aria-hidden="true" />} preserveValuesAfterSubmit confirmation={{ title: replacement ? "Publish this schedule change?" : "Publish this schedule?", description: `${summary}. Check the weekdays and work periods. Published history and recorded attendance are always preserved${replacement ? "; dates before the change keep the current pattern" : ""}.` }}>
    {headerFields}
    <FieldGrid columns={3}>
      {replacement ? <SelectField label="What should change?" name="editScope" value={range.scope} onChange={e => setRange(current => ({ ...current, scope: e.target.value }))}><option value="FUTURE">From a date onward</option><option value="OCCURRENCE">A single date only (one-day override)</option><option value="CUSTOM">A bounded date range</option><option value="SERIES">The whole assignment (not yet started)</option></SelectField>
        : <SelectField label="Recurrence" name="duration" value={range.duration} onChange={e => setRange(current => ({ ...current, duration: e.target.value }))}><option value="INDEFINITE">Every week, no end date</option><option value="WEEK">One week only</option><option value="CUSTOM">Every week until an end date</option></SelectField>}
      <Field label={replacement && range.scope === "OCCURRENCE" ? "Date" : "Starts on"} name="effectiveFrom" type="date" required min={from} readOnly={replacement && range.scope === "SERIES"} value={start} onInput={e => { const next = e.currentTarget.value; setRange(current => ({ ...current, from: next })); }} />
      <Field label="Ends before (exclusive)" name="effectiveUntil" type="date" min={start} readOnly={automaticEnd} required={!automaticEnd && replacement} value={end} onInput={e => { const next = e.currentTarget.value; setRange(current => ({ ...current, until: next })); }} hint={automaticEnd ? "Set automatically from the choice above." : "The first date the pattern no longer applies."} />
    </FieldGrid>
    {children}
    <div className="rounded-lg border bg-subtle px-4 py-3 text-sm"><p className="font-medium">Applies: {summary}</p><p className="mt-0.5 text-muted-foreground">Organization timezone {timezone}. Dates refer to each period’s start date.</p></div>
  </ActionForm>;
}
