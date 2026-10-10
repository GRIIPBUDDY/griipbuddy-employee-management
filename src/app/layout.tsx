import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: { default: "GriipBuddy People", template: "%s · GriipBuddy People" }, description: "Internal employee management workspace", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-4">Skip to content</a>{children}</body></html>;
}
