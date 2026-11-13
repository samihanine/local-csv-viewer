import type { Row } from "@/lib/csv";
import { type ColumnSchema, type OptionColor, parseDate } from "@/lib/schema";
import type { Phase } from "@/lib/workspace-store";

export const PHASE_COLORS: OptionColor[] = [
  "blue",
  "green",
  "amber",
  "purple",
  "red",
  "teal",
  "pink",
  "orange",
  "indigo",
];

const START = new Set(["start", "debut", "begin", "from", "depart"]);
const END = new Set(["end", "fin", "to", "until", "finish", "stop"]);
const NOISE = new Set(["date", "le", "de", "du", "d", "at", "on"]);

const words = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** What a column describes once its start/end and "date" words are removed, plus which bound it is. */
function bound(name: string): { key: string; kind: "start" | "end" } | undefined {
  const parts = words(name);
  const kind = parts.some((w) => START.has(w)) ? "start" : parts.some((w) => END.has(w)) ? "end" : undefined;
  if (!kind) return;
  return { kind, key: parts.filter((w) => !START.has(w) && !END.has(w) && !NOISE.has(w)).join(" ") };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Pairs date columns such as "test_start_date" / "test_end_date" into phases. */
export function guessPhases(columns: string[], types: ColumnSchema[]): Phase[] {
  const dated = columns.filter((_, index) => types[index]?.type === "date");
  const candidates = dated.length >= 2 ? dated : columns;
  const starts = new Map<string, string>();
  const ends = new Map<string, string>();
  for (const column of candidates) {
    const b = bound(column);
    if (b?.kind === "start" && !starts.has(b.key)) starts.set(b.key, column);
    if (b?.kind === "end" && !ends.has(b.key)) ends.set(b.key, column);
  }
  const phases: Phase[] = [];
  for (const [key, start] of starts) {
    const end = ends.get(key);
    if (!end) continue;
    phases.push({
      id: `auto-${key || "phase"}`,
      name: key ? capitalize(key) : "Période",
      start,
      end,
      color: PHASE_COLORS[phases.length % PHASE_COLORS.length] ?? "blue",
    });
  }
  return phases;
}

export type Bar = { phase: Phase; from: string; to: string };

/** The phases of a row that have both dates. A phase whose end is before its start is drawn the other way. */
export function rowBars(row: Row, columns: string[], types: ColumnSchema[], phases: Phase[]): Bar[] {
  return phases.flatMap((phase) => {
    const [s, e] = [columns.indexOf(phase.start), columns.indexOf(phase.end)];
    if (s < 0 || e < 0) return [];
    const from = parseDate(row.cells[s] ?? "", types[s]?.dateFormat);
    const to = parseDate(row.cells[e] ?? "", types[e]?.dateFormat);
    if (!from || !to) return [];
    return [from <= to ? { phase, from, to } : { phase, from: to, to: from }];
  });
}

export const DAY = 86_400_000;
export const toDay = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
export const fromDay = (day: number) => new Date(day * DAY);
