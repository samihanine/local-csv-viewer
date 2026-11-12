import type * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground block w-full resize-none bg-transparent px-3 py-2 text-sm leading-relaxed outline-none",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
