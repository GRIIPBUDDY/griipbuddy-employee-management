import { randomUUID } from "node:crypto";
import { ClipboardList, Plus, CheckCircle2, PlayCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextAreaField, FieldGrid } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { FilterBar } from "@/components/ui/filter-bar";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardContent } from "@/components/ui/card";
import { taskData } from "@/features/tasks/service";
import { taskAction } from "@/features/tasks/actions";
import { displayInstant, dateKey } from "@/features/time/dates";
import { EmployeePicker } from "./employee-picker";
import type { Query } from "@/lib/utils/query";
type Data = Awaited<ReturnType<typeof taskData>>;
type Task = Data["records"][number];
const priorities = ["LOW", "NORMAL", "HIGH"], words = (v: string) => v[0] + v.slice(1).toLowerCase().replaceAll("_", " ");
const overdue = (t: Task, today: string) => t.status !== "COMPLETED" && !!t.dueDate && dateKey(t.dueDate) < today;
function TaskFields({ task, from }: { task?: Task; from: string }) {
  return <><Field label="Title" name="title" required maxLength={150} defaultValue={task?.title} /><TextAreaField label="Description" name="description" maxLength={5000} rows={3} defaultValue={task?.description} />
    <FieldGrid columns={3}><Field label="Assigned date" name="assignedDate" type="date" required defaultValue={task ? dateKey(task.assignedDate) : from} /><Field label="Due date" name="dueDate" type="date" defaultValue={task?.dueDate ? dateKey(task.dueDate) : ""} hint="Optional." /><SelectField label="Priority" name="priority" defaultValue={task?.priority ?? "NORMAL"}>{priorities.map(p => <option key={p} value={p}>{words(p)}</option>)}</SelectField></FieldGrid></>;
}
export function AssignTaskButton({ employees, today }: { employees: { id: string; legalName: string; employeeNumber: string }[]; today: string }) {
  return <Dialog sheet variant="default" trigger={<><Plus size={16} aria-hidden="true" />Assign task</>} title="Assign a task" description="Lightweight one-off work items. Choose one or several employees; each receives their own assignment and notification.">
    <ActionForm action={taskAction} submitLabel="Assign task"><input type="hidden" name="kind" value="assign" /><input type="hidden" name="operationKey" value={randomUUID()} /><TaskFields from={today} /><EmployeePicker employees={employees} /></ActionForm></Dialog>;
}
function TaskFilters({ data, staff, employees, employeeId = "" }: { data: Data; staff: boolean; employees?: { id: string; legalName: string }[]; employeeId?: string }) {
  return <FilterBar resetHref={staff ? "/manage/tasks" : "/me/tasks"} columns={staff ? 5 : 4}>
    <Field label="Search" name="search" type="search" placeholder={staff ? "Task or employee" : "Task title"} defaultValue={data.search} maxLength={150} />
    <SelectField label="Status" name="status" defaultValue={data.status ?? ""}><option value="">All statuses</option><option value="OPEN">Open (not completed)</option><option value="OVERDUE">Overdue</option><option value="ASSIGNED">Not started</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option></SelectField>
    {staff && employees && <SelectField label="Employee" name="employeeId" defaultValue={employeeId}><option value="">All employees</option>{employees.map(e => <option key={e.id} value={e.id}>{e.legalName}</option>)}</SelectField>}
    <SelectField label="Date applies to" name="dateBy" defaultValue={data.dateBy}><option value="ASSIGNED">Assigned date</option><option value="DUE">Due date</option><option value="COMPLETED">Completion date</option></SelectField>
    <DateRangeFilter mode={data.mode} from={data.from} to={data.to} modes={["all", "today", "date", "week", "month", "custom"]} timezone={data.timezone} />
  </FilterBar>;
}
export function StaffTasks({ data, employees, query }: { data: Data; employees: { id: string; legalName: string; employeeNumber: string }[]; query: Query }) {
  return <><TaskFilters data={data} staff employees={employees} employeeId={typeof query.employeeId === "string" ? query.employeeId : ""} />
    {!data.records.length ? <EmptyState icon={ClipboardList} title="No tasks match these filters" description="Assign a task, or widen the dates and status filters." /> :
    <TableContainer label="Task assignments"><table className="data-table min-w-[960px]"><thead><tr><th>Task</th><th>Employee</th><th>Assigned</th><th>Due</th><th>Priority</th><th>Status</th><th>Completion</th><th className="text-right">Actions</th></tr></thead><tbody>{data.records.map(t => <tr key={t.id}>
      <td className="max-w-72"><Cell2 primary={t.title} secondary={<span className="line-clamp-1">{t.description || "No description"}</span>} /></td>
      <td className="whitespace-nowrap"><Cell2 primary={t.employee?.legalName ?? "—"} secondary={t.employee?.employeeNumber} /></td>
      <td className="whitespace-nowrap tabular-nums">{dateKey(t.assignedDate)}</td>
      <td className="whitespace-nowrap tabular-nums">{t.dueDate ? dateKey(t.dueDate) : "—"}{overdue(t, data.today) && <StatusBadge className="ml-2" status="OVERDUE" />}</td>
      <td>{t.priority === "HIGH" ? <StatusBadge status="HIGH" label="High" /> : <span className="text-[13px] text-muted-foreground">{words(t.priority)}</span>}</td>
      <td><StatusBadge status={t.status} label={t.status === "ASSIGNED" ? "Not started" : undefined} /></td>
      <td className="text-[13px]">{t.completedAt ? <Cell2 primary={displayInstant(t.completedAt, data.timezone)} secondary={t.completionNote || undefined} /> : <span className="text-muted-foreground">—</span>}</td>
      <td className="text-right">{t.status !== "COMPLETED" ? <Dialog triggerSize="sm" variant="ghost" trigger="Edit" triggerLabel={`Edit ${t.title} for ${t.employee?.legalName ?? "employee"}`} title="Edit assignment" description={`For ${t.employee?.legalName ?? "employee"}. Completed assignments are kept unchanged.`}><ActionForm action={taskAction} submitLabel="Save assignment"><input type="hidden" name="kind" value="edit" /><input type="hidden" name="id" value={t.id} /><input type="hidden" name="revision" value={t.revision} /><TaskFields task={t} from={data.today} /><Field label="Reason for the change" name="reason" required maxLength={500} /></ActionForm></Dialog> : <span className="text-xs text-muted-foreground">Locked</span>}</td>
    </tr>)}</tbody></table></TableContainer>}
    <Pagination page={data.page} pages={data.pages} total={data.total} noun="assignments" query={query} /></>;
}
export function MyTasks({ data, query }: { data: Data; query: Query }) {
  return <><TaskFilters data={data} staff={false} />
    {!data.records.length ? <EmptyState icon={ClipboardList} title={data.status === "OPEN" ? "No open tasks" : "No tasks match these filters"} description={data.status === "OPEN" ? "You’re all caught up. New assignments will appear here." : "Try a different status or date."} /> :
    <div className="grid gap-3 lg:grid-cols-2">{data.records.map(t => { const future = dateKey(t.assignedDate) > data.today; return <Card key={t.id} className={overdue(t, data.today) ? "border-[#fecdca]" : undefined}><CardContent className="space-y-3 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-semibold">{t.title}</h2><div className="flex gap-1.5">{t.priority === "HIGH" && <StatusBadge status="HIGH" label="High priority" />}{overdue(t, data.today) && <StatusBadge status="OVERDUE" />}<StatusBadge status={t.status} label={t.status === "ASSIGNED" ? "Not started" : undefined} /></div></div>
      {t.description && <p className="whitespace-pre-wrap text-sm leading-6 text-[#344054]">{t.description}</p>}
      <p className="text-[13px] text-muted-foreground">Assigned {dateKey(t.assignedDate)}{t.dueDate ? ` · due ${dateKey(t.dueDate)}` : " · no due date"}</p>
      {t.completedAt && <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-[#054f31]">Completed {displayInstant(t.completedAt, data.timezone)}{t.completionNote ? ` — ${t.completionNote}` : ""}</p>}
      {t.status !== "COMPLETED" && (!data.operational ? <p className="text-sm text-warning">Task updates are unavailable while your account is on hold.</p> : future ? <p className="text-sm text-muted-foreground">You can update this task from {dateKey(t.assignedDate)}.</p> : <div className="flex flex-wrap gap-2">
        {t.status === "ASSIGNED" && <ActionForm compact action={taskAction} submitVariant="outline" submitSize="sm" submitLabel="Start task" submitIcon={<PlayCircle size={15} aria-hidden="true" />}><input type="hidden" name="kind" value="progress" /><input type="hidden" name="id" value={t.id} /><input type="hidden" name="revision" value={t.revision} /><input type="hidden" name="status" value="IN_PROGRESS" /></ActionForm>}
        <Dialog triggerSize="sm" variant="default" trigger={<><CheckCircle2 size={15} aria-hidden="true" />Mark complete</>} title="Complete task" description={t.title} size="sm"><ActionForm action={taskAction} submitLabel="Mark complete" confirmation={{ title: "Mark this task complete?", description: "Completion is final and recorded with the current time. Only your own assignment is affected.", label: "Complete task" }}><input type="hidden" name="kind" value="progress" /><input type="hidden" name="id" value={t.id} /><input type="hidden" name="revision" value={t.revision} /><input type="hidden" name="status" value="COMPLETED" /><TextAreaField label="Completion note" name="note" maxLength={2000} rows={3} hint="Optional." /></ActionForm></Dialog>
      </div>)}
    </CardContent></Card>; })}</div>}
    <Pagination page={data.page} pages={data.pages} total={data.total} noun="tasks" query={query} /></>;
}
