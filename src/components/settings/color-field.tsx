"use client";
import { useState } from "react";
import { brandPalette, contrastWithWhite, isHexColor } from "@/lib/branding/palette";
/** Brand color input with a live preview and a readability check against white button text. */
export function ColorField({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue), valid = isHexColor(value.toLowerCase()), palette = brandPalette(valid ? value.toLowerCase() : defaultValue), readable = valid && contrastWithWhite(value.toLowerCase()) >= 4.5;
  return <div className="space-y-2">
    <label htmlFor="brandColor" className="text-sm font-medium">Brand color</label>
    <div className="flex flex-wrap items-center gap-3">
      <input type="color" aria-label="Pick brand color" value={palette.primary} onChange={e => setValue(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border bg-surface p-1" />
      <input id="brandColor" name="brandColor" value={value} onChange={e => setValue(e.target.value.trim())} required pattern="#[0-9a-fA-F]{6}" maxLength={7} className="h-10 w-32 rounded-lg border bg-surface px-3 font-mono text-sm" />
      <span className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-white" style={{ background: palette.primary }}>Button</span>
      <span className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium" style={{ background: palette.soft, color: palette.primary }}>Selected</span>
    </div>
    <p className={readable ? "text-xs text-muted-foreground" : "text-xs text-danger"}>{readable ? "Used for buttons, links and highlights." : "Choose a darker color so white text on buttons stays readable."}</p>
  </div>;
}
