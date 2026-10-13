import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
import { branding } from "@/features/settings/organization";
import { brandStyle } from "@/lib/branding/palette";
// Branding is configurable in Settings, so every page reads it at request time (with a safe default).
async function brand() { await connection(); try { return await branding(); } catch { return null; } }
export async function generateMetadata(): Promise<Metadata> {
  const name = (await brand())?.companyName ?? "GriipBuddy People";
  return { title: { default: name, template: `%s · ${name}` }, description: "Internal employee management workspace", robots: { index: false, follow: false } };
}
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const b = await brand();
  return <html lang="en"><head><style>{brandStyle(b?.brandColor ?? "#4b2a5e")}</style></head><body><a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-pop">Skip to content</a>{children}</body></html>;
}
