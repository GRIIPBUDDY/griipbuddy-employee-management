import Link from "next/link";
export default function Forbidden() { return <main id="main" className="mx-auto max-w-xl p-12"><h1 className="text-2xl font-semibold">Access unavailable</h1><p className="my-4 text-muted-foreground">Your account does not have permission for this area.</p><Link className="text-blue-700 underline" href="/dashboard">Back to dashboard</Link></main>; }
