"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="main" className="p-12"><h1 className="text-2xl font-semibold">Something went wrong</h1><p className="my-4 text-muted-foreground">Please try again. Contact your administrator if this continues.</p><Button onClick={reset}>Try again</Button></main>; }
