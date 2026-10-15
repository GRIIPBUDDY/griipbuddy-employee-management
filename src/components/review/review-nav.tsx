import { TabNav } from "@/components/ui/tabs";
export function ReviewNav() { return <TabNav label="Attendance review" items={[{ label: "Attendance", href: "/manage/attendance" }, { label: "Work time", href: "/manage/work-time" }, { label: "Corrections", href: "/manage/corrections" }, { label: "Overtime", href: "/manage/overtime" }, { label: "Leave & holidays", href: "/manage/leave" }]} />; }
