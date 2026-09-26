import { hexToTriplet } from "../../palette";

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = hexToTriplet(hex)
      .split(" ")
      .map((channel) => {
        const c = Number(channel) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
