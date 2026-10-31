import * as chrono from "chrono-node";

/** Parse ISO or natural text in the system timezone. No time given means 10:00 local. Null if unreadable. */
export function parseDue(text: string, now = new Date()): Date | null {
  const [hit] = chrono.parse(text, now, { forwardDate: true });
  if (!hit) return null;
  const d = hit.start.date();
  if (!hit.start.isCertain("hour")) d.setHours(10, 0, 0, 0);
  return d;
}

export function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

export function fmt(d: Date | string): string {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`;
}
