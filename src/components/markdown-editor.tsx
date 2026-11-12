import {
  BoldIcon,
  CodeIcon,
  EyeIcon,
  HeadingIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  type LucideIcon,
  PencilIcon,
  StrikethroughIcon,
  TextQuoteIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

type Edit = { text: string; start: number; end: number };

/** Wraps the selection, or removes the markers when it is already wrapped. */
function wrap(value: string, start: number, end: number, marker: string, placeholder: string): Edit {
  const selected = value.slice(start, end);
  const size = marker.length;
  if (value.slice(start - size, start) === marker && value.slice(end, end + size) === marker)
    return {
      text: value.slice(0, start - size) + selected + value.slice(end + size),
      start: start - size,
      end: end - size,
    };
  const inner = selected || placeholder;
  return {
    text: value.slice(0, start) + marker + inner + marker + value.slice(end),
    start: start + size,
    end: start + size + inner.length,
  };
}

/** Adds a prefix to every selected line, or removes it when they all have it. */
function prefix(value: string, start: number, end: number, mark: (index: number) => string, pattern: RegExp): Edit {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const to = value.indexOf("\n", end) < 0 ? value.length : value.indexOf("\n", end);
  const lines = value.slice(from, to).split("\n");
  const remove = lines.every((line) => pattern.test(line));
  const next = lines.map((line, i) => (remove ? line.replace(pattern, "") : mark(i) + line.replace(pattern, "")));
  const text = value.slice(0, from) + next.join("\n") + value.slice(to);
  return { text, start: from, end: from + next.join("\n").length };
}

function link(value: string, start: number, end: number): Edit {
  const label = value.slice(start, end) || "texte";
  const text = `${value.slice(0, start)}[${label}](https://)${value.slice(end)}`;
  const urlStart = start + label.length + 3;
  return { text, start: urlStart, end: urlStart + 8 };
}

type Tool = { label: string; icon: LucideIcon; shortcut?: string; run: (value: string, s: number, e: number) => Edit };

const ANY_PREFIX = /^(#{1,3} |[-*] |\d+[.)] |> )/;

const TOOLS: Tool[] = [
  { label: "Gras", icon: BoldIcon, shortcut: "b", run: (v, s, e) => wrap(v, s, e, "**", "gras") },
  { label: "Italique", icon: ItalicIcon, shortcut: "i", run: (v, s, e) => wrap(v, s, e, "*", "italique") },
  { label: "Barré", icon: StrikethroughIcon, run: (v, s, e) => wrap(v, s, e, "~~", "barré") },
  { label: "Code", icon: CodeIcon, shortcut: "e", run: (v, s, e) => wrap(v, s, e, "`", "code") },
  { label: "Titre", icon: HeadingIcon, run: (v, s, e) => prefix(v, s, e, () => "## ", ANY_PREFIX) },
  { label: "Liste à puces", icon: ListIcon, run: (v, s, e) => prefix(v, s, e, () => "- ", ANY_PREFIX) },
  {
    label: "Liste numérotée",
    icon: ListOrderedIcon,
    run: (v, s, e) => prefix(v, s, e, (i) => `${i + 1}. `, ANY_PREFIX),
  },
  { label: "Citation", icon: TextQuoteIcon, run: (v, s, e) => prefix(v, s, e, () => "> ", ANY_PREFIX) },
  { label: "Lien", icon: LinkIcon, shortcut: "k", run: link },
];

const COMMIT_DELAY = 600;

type MarkdownEditorProps = {
  value: string;
  onCommit: (value: string) => void;
  autoFocus?: boolean;
  /** Starts on the rendered text when there is something to read. */
  previewFirst?: boolean;
  className?: string;
  minRows?: number;
};

export function MarkdownEditor({
  value,
  onCommit,
  autoFocus,
  previewFirst,
  className,
  minRows = 6,
}: MarkdownEditorProps) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  const [preview, setPreview] = useState(!!previewFirst && value.trim() !== "");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<[number, number] | null>(null);
  const latest = useRef({ draft, value, onCommit });
  latest.current = { draft, value, onCommit };

  // The value changed outside (another view, file reloaded): follow it.
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }

  const commit = () => {
    const current = latest.current;
    if (current.draft !== current.value) current.onCommit(current.draft);
  };

  // Saves shortly after typing stops, and when the editor goes away.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `commit` reads the latest values from a ref
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(commit, COMMIT_DELAY);
    return () => clearTimeout(timer);
  }, [draft, value]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on unmount only
  useEffect(() => commit, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: restores the selection after each toolbar edit
  useEffect(() => {
    if (!selection.current || !textarea.current) return;
    textarea.current.focus();
    textarea.current.setSelectionRange(...selection.current);
    selection.current = null;
  }, [draft]);

  const apply = (tool: Tool) => {
    const element = textarea.current;
    if (!element) return;
    const edit = tool.run(draft, element.selectionStart, element.selectionEnd);
    selection.current = [edit.start, edit.end];
    setDraft(edit.text);
  };

  return (
    <div
      className={cn(
        "border-input focus-within:border-ring focus-within:ring-ring/50 overflow-hidden rounded-lg border transition-colors focus-within:ring-3",
        className,
      )}
    >
      <div className="bg-muted/40 flex items-center gap-0.5 border-b px-1.5 py-1">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.shortcut ? `${tool.label} (Ctrl+${tool.shortcut.toUpperCase()})` : tool.label}
            aria-label={tool.label}
            disabled={preview}
            // Keeps the selection in the textarea.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply(tool)}
            className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-7 place-items-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40"
          >
            <tool.icon className="size-3.5" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPreview(!preview)}
          className="text-muted-foreground hover:bg-muted hover:text-foreground ml-auto flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors"
        >
          {preview ? <PencilIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
          {preview ? "Modifier" : "Aperçu"}
        </button>
      </div>
      {preview ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: double-click is a shortcut, the toolbar button is the accessible path
        <div
          className="min-h-24 cursor-text px-3 py-2 text-sm"
          onDoubleClick={() => setPreview(false)}
          title="Double-cliquez pour modifier"
        >
          {draft.trim() ? <Markdown text={draft} /> : <span className="text-muted-foreground">Vide</span>}
        </div>
      ) : (
        <Textarea
          ref={textarea}
          value={draft}
          autoFocus={autoFocus}
          rows={Math.min(Math.max(minRows, draft.split("\n").length + 1), 24)}
          placeholder="Écrivez en markdown : **gras**, *italique*, - liste…"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            const tool = (event.ctrlKey || event.metaKey) && TOOLS.find((t) => t.shortcut === event.key.toLowerCase());
            if (!tool) return;
            event.preventDefault();
            apply(tool);
          }}
        />
      )}
    </div>
  );
}
