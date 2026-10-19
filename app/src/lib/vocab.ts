// Pure helpers for the Words view: day keys/labels, grouping, and the
// saved-word underline matching used when rendering part spans.
import type { VocabRecord } from "./db";

export function dayKey(ts: number, now = new Date()): string {
  const d = new Date(ts);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  void now;
  return local.toISOString().slice(0, 10);
}

export function dayLabel(key: string, todayKey?: string): string {
  const today = todayKey ?? dayKey(Date.now());
  if (key === today) return "Today";
  const y = new Date(today + "T12:00:00");
  y.setDate(y.getDate() - 1);
  if (key === dayKey(y.getTime())) return "Yesterday";
  const d = new Date(key + "T12:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  if (Number.isNaN(d.getTime())) return key;
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

export interface DayGroup {
  key: string;
  label: string;
  records: VocabRecord[];
}

/** Newest day first; records inside a day newest first. */
export function groupByDay(records: VocabRecord[]): DayGroup[] {
  const map = new Map<string, VocabRecord[]>();
  for (const r of records) {
    const arr = map.get(r.dayKey) ?? [];
    arr.push(r);
    map.set(r.dayKey, arr);
  }
  const today = dayKey(Date.now());
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, recs]) => ({
      key,
      label: dayLabel(key, today),
      records: recs.sort((a, b) => b.savedAt - a.savedAt),
    }));
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type Decorated = Array<{ match: boolean; text: string }>;

/**
 * Split text into plain/matched runs for the saved-word underline.
 * Longest norm first so "state of the art" beats "state"; word-boundary,
 * case-insensitive matching. Norms that can't form a word-boundary match
 * (e.g. empty) are ignored.
 */
export function decorateText(text: string, norms: string[]): Decorated {
  const usable = norms
    .map((n) => n.trim())
    .filter((n) => n.length > 0 && /\w/.test(n))
    .sort((a, b) => b.length - a.length);
  if (!usable.length) return [{ match: false, text }];
  let re: RegExp;
  try {
    re = new RegExp(`\\b(${usable.map(escapeRegExp).join("|")})\\b`, "gi");
  } catch {
    return [{ match: false, text }];
  }
  const out: Decorated = [];
  let last = 0;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ match: false, text: text.slice(last, m.index) });
    out.push({ match: true, text: m[0] });
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) out.push({ match: false, text: text.slice(last) });
  return out.length ? out : [{ match: false, text }];
}
