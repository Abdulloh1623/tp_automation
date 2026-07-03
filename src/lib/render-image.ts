// SVG → PNG render (resvg-js). Worker (tsx) va Next server'da ishlaydi.
import { Resvg } from "@resvg/resvg-js";

/** SVG string'ni PNG Buffer'ga aylantiradi. width berilsa shu kenglikka moslaydi. */
export function svgToPng(svg: string, width?: number): Buffer {
  const r = new Resvg(svg, {
    fitTo: width ? { mode: "width", value: width } : { mode: "original" },
    // Docker'da DejaVu Sans (Dockerfile'da o'rnatiladi), Windows dev'da Arial topiladi
    font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" },
  });
  return Buffer.from(r.render().asPng());
}
