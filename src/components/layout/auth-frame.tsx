/** Centered full-page state for errors, denied access and missing records. */
export function StatePage({ code, title, description, children }: { code: string; title: string; description: string; children?: React.ReactNode }) {
  return <main id="main" className="grid min-h-dvh place-items-center bg-background px-5"><div className="max-w-md text-center"><p className="text-sm font-semibold text-primary">{code}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>{children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}</div></main>;
}
