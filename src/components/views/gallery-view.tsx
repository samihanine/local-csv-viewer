import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/views/cards";
import { useView } from "@/lib/view-context";

const PAGE = 60;

export function GalleryView() {
  const { visible, openRow, newRow } = useView();
  const [limit, setLimit] = useState(PAGE);

  return (
    <div className="h-full overflow-y-auto p-6 max-sm:p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
        {visible.slice(0, limit).map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => openRow(row.id)}
            className="bg-card hover:border-foreground/20 focus-visible:ring-ring/50 flex min-h-28 flex-col gap-1.5 rounded-xl border p-4 text-left shadow-xs transition-all outline-none hover:shadow-md focus-visible:ring-3"
          >
            <CardContent row={row} excerpt />
          </button>
        ))}
        <button
          type="button"
          onClick={() => newRow()}
          className="text-muted-foreground hover:bg-muted/40 hover:text-foreground flex min-h-28 items-center justify-center gap-2 rounded-xl border border-dashed transition-colors"
        >
          <PlusIcon className="size-4" /> Nouvelle ligne
        </button>
      </div>
      {visible.length > limit && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" size="sm" className="h-9 px-4 text-sm" onClick={() => setLimit(limit + PAGE)}>
            Afficher plus ({visible.length - limit} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}
