"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Upload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
/** Logo upload through a size-bounded API route (server actions are limited to small bodies). */
export function LogoUpload({ logo, custom }: { logo: string; custom: boolean }) {
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [preview, setPreview] = useState(logo), input = useRef<HTMLInputElement>(null), router = useRouter();
  async function send(method: "POST" | "DELETE", body?: FormData) {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/manage/settings/logo", { method, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error ?? "The logo could not be saved."); return; }
      window.dispatchEvent(new CustomEvent("workspace:saved", { detail: method === "POST" ? "Logo updated." : "Default logo restored." }));
      router.refresh();
    } catch { setError("The logo could not be saved. Please retry."); } finally { setPending(false); if (input.current) input.current.value = ""; }
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-4">
      {/* Logo preview: checkerboard shows transparency. */}
      <img src={preview} alt="Current logo" width={72} height={72} className="h-[72px] w-[72px] rounded-xl border bg-[conic-gradient(#f2f4f7_25%,#fff_0_50%,#f2f4f7_0_75%,#fff_0)] bg-[length:12px_12px] object-contain" />
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="logo-file" aria-label="Logo image" onChange={event => { const file = event.target.files?.[0]; if (!file) return; setPreview(URL.createObjectURL(file)); const data = new FormData(); data.set("logo", file); void send("POST", data); }} />
        <Button type="button" variant="outline" disabled={pending} onClick={() => input.current?.click()}>{pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}Upload logo</Button>
        {custom && <Button type="button" variant="ghost" disabled={pending} onClick={() => { setPreview(logo); void send("DELETE"); }}><RotateCcw size={16} aria-hidden="true" />Restore default</Button>}
      </div>
    </div>
    <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 2 MB. A square image works best; it is resized to at most 512 × 512 px and appears on sign-in, navigation and every PDF.</p>
    {error && <Alert tone="danger" role="alert">{error}</Alert>}
  </div>;
}
