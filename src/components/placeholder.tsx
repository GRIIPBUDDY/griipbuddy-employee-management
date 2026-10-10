import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
export function Placeholder({ title }: { title: string }) {
  return <><div><p className="text-sm text-muted-foreground">People workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1></div><Card><CardHeader><CardTitle>Coming in a later phase</CardTitle><CardDescription>This area is reserved for the next product development phases.</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">The foundation provides secure access and navigation. No records or workflows are available in this module yet.</p></CardContent></Card></>;
}
