"use client";
import { useRef, useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { standardDailyPattern } from "@/features/time/default-pattern";
import { draftSlots, draftWeekdays, timeMinutes, weeklyDraftMinutes, type DraftSlot } from "@/features/time/schedule-draft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SlotInput } from "@/features/time/validation";
import { minuteLabel } from "@/features/time/dates";
import { cn } from "@/lib/utils/cn";
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hours = (minutes: number) => `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
function periodMinutes(row: DraftSlot) { const d = timeMinutes(row.end) + 1440 * row.endDayOffset - timeMinutes(row.start); return Number.isFinite(d) && d > 0 && d <= 1440 ? d : null; }
/**
 * Weekly recurring pattern editor. Each weekday row owns its work periods, so the selected days always match
 * the submitted periods (an unchecked day can never submit hidden periods). Field names are unchanged for the server action.
 */
export function ScheduleFields({ initial = standardDailyPattern([1, 2, 3, 4, 5, 6], 480) }: { initial?: SlotInput[] }) {
  const [rows, setRows] = useState(() => draftSlots(initial)), [start, setStart] = useState(minuteLabel(initial[0]?.startMinute ?? 480));
  const nextKey = useRef(initial.length), days = draftWeekdays(rows), minutes = weeklyDraftMinutes(rows);
  const update = (key: number, patch: Partial<DraftSlot>) => setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row));
  const make = (slots: SlotInput[]) => { const added = draftSlots(slots, nextKey.current); nextKey.current += added.length; return added; };
  const preset = Number.isFinite(timeMinutes(start)) ? timeMinutes(start) : null;
  const applyDefault = (targetDays: number[]) => { if (preset === null || !targetDays.length) return; setRows(make(standardDailyPattern(targetDays, preset))); };
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-subtle p-4">
      <label className="grid gap-1.5 text-sm"><span className="font-medium">Default pattern start</span><Input name="presetStart" type="time" value={start} onInput={e => setStart(e.currentTarget.value)} className="w-32" /></label>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={preset === null} onClick={() => applyDefault([1, 2, 3, 4, 5, 6])}><Wand2 size={14} aria-hidden="true" />Mon–Sat default</Button><Button type="button" variant="outline" size="sm" disabled={preset === null} onClick={() => applyDefault([1, 2, 3, 4, 5])}>Mon–Fri default</Button><Button type="button" variant="outline" size="sm" disabled={preset === null || !days.length} onClick={() => applyDefault(days)}>Apply to selected days</Button><Button type="button" variant="ghost" size="sm" disabled={!rows.length} onClick={() => setRows([])}>Clear all</Button></div>
      <p className="w-full text-xs leading-5 text-muted-foreground">Default pattern: 4 hours work, 4 hours break, 4 hours work. It replaces the draft for the chosen days; you can then adjust any period.</p>
    </div>
    <div className="divide-y rounded-xl border bg-surface">{weekdays.map((name, index) => {
      const weekday = index + 1, dayRows = rows.filter(row => row.weekday === weekday), on = dayRows.length > 0;
      const dayMinutes = dayRows.reduce((sum, row) => sum + (periodMinutes(row) ?? 0), 0);
      return <div key={name} className="grid gap-3 px-4 py-3 sm:grid-cols-[10rem_1fr]">
        <label className="flex items-center gap-2.5 text-sm font-medium"><input type="checkbox" aria-label={name} checked={on} disabled={!on && preset === null} onChange={e => e.target.checked ? setRows(current => [...current, ...make(standardDailyPattern([weekday], preset ?? 480))]) : setRows(current => current.filter(row => row.weekday !== weekday))} />{name}{on && <span className="ml-auto text-xs font-normal text-muted-foreground sm:ml-0">{hours(dayMinutes)}</span>}</label>
        <div className="flex min-w-0 flex-wrap items-center gap-2">{!on && <span className="text-sm text-muted-foreground">Rest day</span>}
          {dayRows.map((row, position) => { const invalid = periodMinutes(row) === null; return <div key={row.key} className={cn("flex items-center gap-1.5 rounded-lg border bg-subtle py-1 pl-2 pr-1", invalid && "border-danger bg-danger-soft")}>
            <input type="hidden" name="slotKey" value={row.key} /><input type="hidden" name={`weekday-${row.key}`} value={row.weekday} /><input type="hidden" name={`endday-${row.key}`} value={row.endDayOffset} />
            <Input aria-label={`${name} period ${position + 1} start`} name={`start-${row.key}`} type="time" required value={row.start} onInput={e => update(row.key, { start: e.currentTarget.value })} className="h-8 w-[6.5rem] px-2" />
            <span aria-hidden="true" className="text-muted-foreground">–</span>
            <Input aria-label={`${name} period ${position + 1} end`} name={`end-${row.key}`} type="time" required value={row.end} onInput={e => update(row.key, { end: e.currentTarget.value })} className="h-8 w-[6.5rem] px-2" />
            <label className="flex items-center gap-1 px-1 text-xs text-muted-foreground" title="The period ends after midnight"><input type="checkbox" checked={row.endDayOffset === 1} onChange={e => update(row.key, { endDayOffset: e.target.checked ? 1 : 0 })} aria-label={`${name} period ${position + 1} ends next day`} />+1 day</label>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${name} period ${position + 1}`} onClick={() => setRows(current => current.filter(s => s.key !== row.key))}><Trash2 size={14} aria-hidden="true" /></Button>
          </div>; })}
          {on && <Button type="button" variant="ghost" size="sm" onClick={() => { const last = dayRows.at(-1), from = Math.min(1320, (last && Number.isFinite(timeMinutes(last.end)) ? timeMinutes(last.end) : 480) + 60); setRows(current => [...current, ...make([{ weekday, startMinute: from, endMinute: Math.min(1439, from + 120), endDayOffset: 0 }])]); }}><Plus size={14} aria-hidden="true" />Add period</Button>}
        </div>
      </div>;
    })}</div>
    <p role="status" className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-3 text-sm", minutes === null && rows.length ? "bg-danger-soft text-[#7a271a]" : "bg-primary-soft text-[#1d2d7a]")}>{rows.length ? <><strong className="font-semibold">{minutes === null ? "Fix the highlighted periods" : `${hours(minutes)} per week`}</strong><span>{rows.length} work periods · {days.map(day => weekdays[day - 1].slice(0, 3)).join(", ")}</span>{minutes === null && <span>Periods must have a positive length and must not overlap.</span>}</> : <strong>Rest pattern — no scheduled work. Publishing this cancels work for the chosen dates.</strong>}</p>
  </div>;
}
