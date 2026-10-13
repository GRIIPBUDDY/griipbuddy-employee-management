import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { notificationPage } from "@/features/review/notifications";
import { organizationSummary } from "@/features/settings/service";
import { ActionForm } from "@/components/ui/action-form";
import { reviewAction } from "@/features/review/actions";
import { Hidden } from "@/components/review/forms";
import { PageHeader } from "@/components/ui/page-header";
import { TabNav } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { displayInstant } from "@/features/time/dates";
import { cn } from "@/lib/utils/cn";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams, identity = await getIdentity(), status = typeof q.status === "string" ? q.status : "ALL", data = await pageResult(notificationPage(identity, { ...(q.page ? { page: q.page } : {}), status })), settings = await pageResult(organizationSummary(identity));
  return <>
    <PageHeader title="Notifications" description="Updates about your own records and, for staff, the work queues you manage. Links open only what you are permitted to see." actions={data.unread > 0 && <ActionForm compact action={reviewAction} submitVariant="outline" submitLabel={`Mark all ${data.unread} as read`}><Hidden values={{ kind: "notificationAll" }} /></ActionForm>} />
    <TabNav label="Notification filter" items={[{ label: "All", href: "/notifications" }, { label: "Unread", href: "/notifications?status=UNREAD", count: data.unread }, { label: "Read", href: "/notifications?status=READ" }]} />
    {!data.records.length ? <EmptyState icon={Bell} title={status === "UNREAD" ? "You’re all caught up" : "No notifications"} description="New updates will appear here." /> :
    <ul className="divide-y overflow-hidden rounded-xl border bg-surface shadow-card">{data.records.map(n => <li key={n.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap", !n.readAt && "bg-primary-soft/40")}>
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
      <Link href={n.href} className="group min-w-0 flex-1"><p className="flex items-center gap-1 text-sm font-semibold group-hover:text-primary">{n.title}<ChevronRight size={14} aria-hidden="true" className="text-slate-400" /></p><p className="mt-0.5 text-sm text-[#344054]">{n.text}</p><time dateTime={n.createdAt.toISOString()} className="mt-1 block text-xs text-muted-foreground">{displayInstant(n.createdAt, settings.timezone)}</time></Link>
      {!n.readAt ? <ActionForm compact action={reviewAction} submitVariant="ghost" submitSize="sm" submitLabel="Mark read"><Hidden values={{ kind: "notification", id: n.id }} /></ActionForm> : <span className="text-xs text-muted-foreground">Read</span>}
    </li>)}</ul>}
    <Pagination page={data.page} pages={data.pages} total={data.total} noun="notifications" query={{ status: status === "ALL" ? undefined : status }} path="/notifications" />
  </>;
}
