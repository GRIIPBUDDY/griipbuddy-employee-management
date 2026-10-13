// Normalizes Next.js searchParams into plain non-empty strings.
export type Query = Record<string, string | string[] | undefined>;
export function strings(query: Query) { return Object.fromEntries(Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== "")); }
