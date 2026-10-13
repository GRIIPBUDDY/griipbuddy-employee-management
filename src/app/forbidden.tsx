import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatePage } from "@/components/layout/auth-frame";
export default function Forbidden() { return <StatePage code="403" title="Access unavailable" description="Your account doesn’t have permission for this area. If you think this is wrong, ask an administrator."><Button asChild><Link href="/dashboard">Back to dashboard</Link></Button></StatePage>; }
