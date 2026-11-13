import { ChartGanttIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PhasesMenu, usePhases } from "@/components/phases-menu";
import type { Row } from "@/lib/csv";
import { type Bar, DAY, fromDay, rowBars, toDay } from "@/lib/gantt";
import { rowTitle } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view-context";

const ZOOMS = {
  day: { label: "Jour", px: 32 },
  week: { label: "Semaine", px: 12 },
  month: { label: "Mois", px: 4 },
} as const;
type Zoom = keyof typeof ZOOMS;

const HEADER = 52;
const PADDING_DAYS = 7;
/** Width of the title column, on the left of the timeline. */
const TITLE_WIDTH = 260;
const OVERSCAN = 8;

const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const display = (iso: string) => dateFormat.format(new Date(`${iso}T00:00:00Z`));

type Line = { row: Row; bars: Bar[] };

function fitZoom(days: number): Zoom {
  if (days <= 75) return "day";
  if (days <= 400) return "week";
  return "month";
}

/** First day of each month between two days, as day numbers. */
function months(first: number, last: number) {
  const result: number[] = [];
  const start = fromDay(first);
  for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); ; m++) {
    const day = Math.round(Date.UTC(y, m, 1) / DAY);
    if (day > last) break;
    result.push(day);
  }
  return result;
}

export function GanttView() {
  const { columns, types, visible, title, selectedId, openRow } = useView();
  const phases = usePhases();

  const lines = useMemo<Line[]>(
    () =>
      visible.flatMap((row) => {
        const bars = rowBars(row, columns, types, phases);
        return bars.length ? [{ row, bars }] : [];
      }),
    [visible, columns, types, phases],
  );

  const range = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const line of lines)
      for (const bar of line.bars) {
        min = Math.min(min, toDay(bar.from));
        max = Math.max(max, toDay(bar.to));
      }
    return Number.isFinite(min) ? { first: min - PADDING_DAYS, last: max + PADDING_DAYS } : undefined;
  }, [lines]);

  const [zoom, setZoom] = useState<Zoom>();
  const active = zoom ?? (range ? fitZoom(range.last - range.first) : "week");

  // One sub-lane per phase, so overlapping phases stay readable.
  const laneHeight = phases.length > 2 ? 9 : 12;
  const rowHeight = Math.max(40, 16 + phases.length * (laneHeight + 3));

  const scroller = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 800, width: 1200 });
  const hasTimeline = phases.length > 0 && range !== undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the scroller only exists once there is a timeline
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const update = () =>
      setViewport({ top: element.scrollTop, height: element.clientHeight, width: element.clientWidth });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [hasTimeline]);

  const days = range ? range.last - range.first + 1 : 1;
  // The timeline fills the width left by the title column, and scrolls when the zoom asks for more.
  const px = Math.max(ZOOMS[active].px, (viewport.width - TITLE_WIDTH) / days);

  const today = Math.floor(Date.now() / DAY);
  // Starts on today when it is in the timeline.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the timeline or the zoom changes
  useEffect(() => {
    const element = scroller.current;
    if (!element || !range) return;
    const visibleWidth = element.clientWidth - TITLE_WIDTH;
    const target = today >= range.first && today <= range.last ? (today - range.first) * px - visibleWidth / 3 : 0;
    element.scrollLeft = Math.max(0, target);
  }, [range?.first, range?.last, active]);

  const zoomBar = (
    <div className="bg-muted/60 flex rounded-lg p-0.5">
      {(Object.keys(ZOOMS) as Zoom[]).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={active === key}
          onClick={() => setZoom(key)}
          className={cn(
            "text-muted-foreground hover:text-foreground h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
            active === key && "bg-background text-foreground shadow-xs",
          )}
        >
          {ZOOMS[key].label}
        </button>
      ))}
    </div>
  );

  if (!phases.length || !range)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="bg-muted grid size-12 place-items-center rounded-xl">
          <ChartGanttIcon className="text-muted-foreground size-6" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">
            {phases.length ? "Aucune ligne n'a de phase complète" : "Définissez les phases du Gantt"}
          </p>
          <p className="text-muted-foreground max-w-md">
            {phases.length
              ? "Une phase n'est dessinée que si ses dates de début et de fin sont remplies. Vérifiez les colonnes choisies et leur format de date."
              : "Une phase associe une colonne de début et une colonne de fin, par exemple test_start_date et test_end_date."}
          </p>
        </div>
        <PhasesMenu />
      </div>
    );

  const timeline = days * px;
  const monthStarts = months(range.first, range.last);
  const x = (iso: string) => (toDay(iso) - range.first) * px;
  const monthBox = (day: number, i: number) => ({
    left: Math.max(0, (day - range.first) * px),
    width: ((monthStarts[i + 1] ?? range.last + 1) - Math.max(day, range.first)) * px,
  });
  const start = Math.max(0, Math.floor((viewport.top - HEADER) / rowHeight) - OVERSCAN);
  const end = Math.min(lines.length, Math.ceil((viewport.top + viewport.height) / rowHeight) + OVERSCAN);
  const titleColumn = columns[title] ?? "Titre";

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b px-6 py-2 max-sm:px-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {phases.map((phase) => (
            <span key={phase.id} className="flex items-center gap-1.5 text-xs">
              <span data-color={phase.color} className="bg-option-dot h-2 w-4 rounded-full" />
              {phase.name}
            </span>
          ))}
        </div>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums max-sm:hidden">
          {lines.length} ligne{lines.length > 1 ? "s" : ""} planifiée{lines.length > 1 ? "s" : ""}
        </span>
        {zoomBar}
      </div>
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto">
        <div style={{ width: TITLE_WIDTH + timeline, height: HEADER + lines.length * rowHeight }} className="relative">
          {/* Timeline background: month bands, week-ends, today. */}
          <div className="absolute inset-y-0" style={{ left: TITLE_WIDTH, width: timeline }}>
            {monthStarts.map((day, i) => (
              <div
                key={day}
                className={cn("absolute top-0 bottom-0 border-l", i % 2 === 1 && "bg-muted/25")}
                style={monthBox(day, i)}
              />
            ))}
            {active === "day" &&
              Array.from({ length: days }, (_, i) => range.first + i)
                .filter((day) => [0, 6].includes(fromDay(day).getUTCDay()))
                .map((day) => (
                  <div
                    key={day}
                    className="bg-muted/40 absolute top-0 bottom-0"
                    style={{ left: (day - range.first) * px, width: px }}
                  />
                ))}
            {today >= range.first && today <= range.last && (
              <div
                className="bg-brand/70 absolute top-0 bottom-0 z-10 w-px"
                style={{ left: (today - range.first) * px + px / 2 }}
              />
            )}
          </div>

          {/* Header: title column, then months and days. */}
          <div className="bg-background/95 sticky top-0 z-30 flex border-b backdrop-blur" style={{ height: HEADER }}>
            <div
              style={{ width: TITLE_WIDTH }}
              className="bg-background text-muted-foreground sticky left-0 z-10 flex shrink-0 items-end border-r px-4 pb-2 text-xs font-medium"
            >
              {titleColumn}
            </div>
            <div className="relative" style={{ width: timeline }}>
              {monthStarts.map((day, i) => (
                <div
                  key={day}
                  className="text-muted-foreground absolute top-0 truncate border-l px-2 pt-1.5 text-xs font-medium capitalize"
                  style={monthBox(day, i)}
                >
                  {monthFormat.format(fromDay(Math.max(day, range.first)))}
                </div>
              ))}
              {active !== "month" &&
                Array.from({ length: days }, (_, i) => range.first + i)
                  .filter((day) => active === "day" || fromDay(day).getUTCDay() === 1)
                  .map((day) => (
                    <div
                      key={day}
                      className={cn(
                        "text-muted-foreground absolute bottom-1.5 text-center text-[11px] tabular-nums",
                        day === today && "text-brand font-semibold",
                      )}
                      style={{ left: (day - range.first) * px, width: active === "day" ? px : px * 7 }}
                    >
                      {fromDay(day).getUTCDate()}
                    </div>
                  ))}
            </div>
          </div>

          {/* One table row per line: its title, then its own phases. */}
          {lines.slice(start, end).map(({ row, bars }, offset) => {
            const top = HEADER + (start + offset) * rowHeight;
            const name = rowTitle(row, title);
            const selected = row.id === selectedId;
            const lanesTop = (rowHeight - phases.length * (laneHeight + 3) + 3) / 2;
            return (
              <div
                key={row.id}
                className={cn("group absolute inset-x-0 flex border-b", selected && "bg-brand/[0.06]")}
                style={{ top, height: rowHeight }}
              >
                <button
                  type="button"
                  onClick={() => openRow(row.id)}
                  title={name}
                  style={{ width: TITLE_WIDTH }}
                  className={cn(
                    "bg-background group-hover:bg-muted/40 sticky left-0 z-20 flex shrink-0 items-center border-r px-4 text-left font-medium outline-none focus-visible:underline",
                    selected &&
                      "text-brand bg-[color-mix(in_oklch,var(--background),var(--brand)_6%)] shadow-[inset_3px_0_0_var(--brand)]",
                  )}
                >
                  <span className="truncate">{name}</span>
                </button>
                <div className="relative" style={{ width: timeline }}>
                  {bars.map((bar) => {
                    const lane = phases.indexOf(bar.phase);
                    return (
                      <button
                        key={bar.phase.id}
                        type="button"
                        data-color={bar.phase.color}
                        onClick={() => openRow(row.id)}
                        title={`${name} — ${bar.phase.name} : ${display(bar.from)} → ${display(bar.to)}`}
                        aria-label={`${name}, ${bar.phase.name}, du ${display(bar.from)} au ${display(bar.to)}`}
                        className="bg-option-dot absolute z-10 rounded-full shadow-xs transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
                        style={{
                          left: x(bar.from),
                          width: Math.max(px, x(bar.to) - x(bar.from) + px),
                          top: lanesTop + lane * (laneHeight + 3),
                          height: laneHeight,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
