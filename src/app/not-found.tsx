import Link from "next/link";
export default function NotFound() { return <main id="main" className="mx-auto max-w-xl p-12"><h1 className="text-2xl font-semibold">Page not found</h1><p className="my-4 text-muted-foreground">The requested page or record is unavailable.</p><Link className="text-blue-700 underline" href="/dashboard">Back to dashboard</Link></main>; }
