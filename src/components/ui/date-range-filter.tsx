"use client";
import { useState } from "react";
import { Field, SelectField } from "./field";
import type { RangeMode } from "@/lib/utils/date-range";
const labels: Record<RangeMode, string> = { today: "Today", date: "Specific date", week: "Week", month: "Month", custom: "Date range", all: "All dates" };
/** Inclusive organization-local date selection. Only the inputs for the chosen mode are submitted. */
export function DateRangeFilter({ mode, from, to, modes = ["today", "date", "week", "month", "custom"], label = "Dates", timezone }: { mode: RangeMode; from?: string; to?: string; modes?: RangeMode[]; label?: string; timezone?: string }) {
  const [current, setCurrent] = useState<RangeMode>(mode);
  return <>
    <SelectField label={label} title={timezone ? `Organization-local dates (${timezone})` : undefined} name="range" value={current} onChange={event => setCurrent(event.target.value as RangeMode)}>{modes.map(m => <option key={m} value={m}>{labels[m]}</option>)}</SelectField>
    {(current === "date" || current === "week" || current === "month") && <Field label={current === "date" ? "Date" : current === "week" ? "Any date in the week" : "Any date in the month"} name="date" type="date" required defaultValue={from} />}
    {current === "custom" && <><Field label="From" name="from" type="date" required defaultValue={from} /><Field label="To (inclusive)" name="to" type="date" required defaultValue={to} /></>}
  </>;
}
