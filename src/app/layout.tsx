import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: { default: "GriipBuddy People", template: "%s · GriipBuddy People" }, description: "Internal employee management workspace", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-pop">Skip to content</a>{children}</body></html>;
}
