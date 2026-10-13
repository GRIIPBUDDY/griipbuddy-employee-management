import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatePage } from "@/components/layout/auth-frame";
export default function NotFound() { return <StatePage code="404" title="Page not found" description="The page or record you requested doesn’t exist or isn’t available to you."><Button asChild><Link href="/dashboard">Back to dashboard</Link></Button></StatePage>; }
