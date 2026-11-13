import { CalendarIcon } from "lucide-react";
import { OptionBadge, optionColor } from "@/components/fields";
import { rowTitle } from "@/components/views/detail-panel";
import type { Row } from "@/lib/csv";
import { plainText } from "@/lib/markdown";
import { type ColumnSchema, displayDate } from "@/lib/schema";
import { useView } from "@/lib/view-context";

const MAX_TEXTS = 2;

/** Title (the starred column) and a compact summary of the other columns. Shared by the kanban and the gallery. */
export function CardContent({ row, hidden = -1, excerpt = false }: { row: Row; hidden?: number; excerpt?: boolean }) {
  const { columns, types, display, title } = useView();
  const fields = columns
    .map((name, index) => ({ name, index, value: row.cells[index] ?? "", schema: types[index] as ColumnSchema }))
    .filter(
      (field) =>
        field.index !== title && field.index !== hidden && display.includes(field.index) && field.value.trim() !== "",
    );
  const long = excerpt ? fields.find((field) => field.schema.type === "longtext") : undefined;
  const texts = fields.filter((field) => field.schema.type === "text").slice(0, MAX_TEXTS);
  const badges = fields.filter((field) => field.schema.type === "select");
  const dates = fields.filter((field) => field.schema.type === "date");

  return (
    <>
      <p className="line-clamp-2 font-medium break-words">{rowTitle(row, title)}</p>
      {long && <p className="text-muted-foreground line-clamp-3 text-[13px] break-words">{plainText(long.value)}</p>}
      {texts.map((field) => (
        <p key={field.name} className="text-muted-foreground truncate text-xs" title={field.name}>
          {field.value}
        </p>
      ))}
      {(badges.length > 0 || dates.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-0.5">
          {badges.map((field) => (
            <span key={field.name} title={field.name} className="flex min-w-0">
              <OptionBadge value={field.value} color={optionColor(field.schema, field.value)} />
            </span>
          ))}
          {dates.map((field) => (
            <span
              key={field.name}
              title={field.name}
              className="text-muted-foreground flex items-center gap-1 text-xs tabular-nums"
            >
              <CalendarIcon className="size-3" /> {displayDate(field.value, field.schema.dateFormat)}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
