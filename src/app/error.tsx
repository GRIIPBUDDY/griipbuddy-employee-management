"use client";
import { Button } from "@/components/ui/button";
import { StatePage } from "@/components/layout/auth-frame";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <StatePage code="Error" title="Something went wrong" description="The page couldn’t be loaded. Nothing was changed. Try again, and contact your administrator if it keeps happening."><Button onClick={reset}>Try again</Button><Button variant="outline" asChild><a href="/dashboard">Go to dashboard</a></Button></StatePage>;
}
