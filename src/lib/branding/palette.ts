/** Brand color utilities (client-safe). The primary color must keep white text readable (WCAG AA 4.5:1). */
const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => "#" + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
const mix = (hex: string, target: number, amount: number) => toHex(channels(hex).map(v => v + (target - v) * amount));
function luminance(hex: string) {
  const [r, g, b] = channels(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const isHexColor = (value: string) => /^#[0-9a-f]{6}$/.test(value);
export const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);
export function brandPalette(hex: string) {
  const primary = isHexColor(hex) ? hex : "#4b2a5e";
  return { primary, strong: mix(primary, 0, 0.18), soft: mix(primary, 255, 0.92), panel: mix(primary, 0, 0.35) };
}
/** CSS custom properties applied to the document so every primary-colored element follows the brand. */
export function brandStyle(hex: string) {
  const p = brandPalette(hex);
  return `:root{--primary:${p.primary};--primary-strong:${p.strong};--primary-soft:${p.soft};--brand-panel:${p.panel};}`;
}
