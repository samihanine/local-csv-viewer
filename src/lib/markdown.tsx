import type { ReactNode } from "react";

// Small markdown renderer that only ever produces React elements: no HTML is injected, so cell content cannot run.

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(~~[^~\n]+?~~)|(\*[^*\s][^*\n]*?\*)|(\b_[^_\s][^_\n]*?_\b)|(\[[^\]\n]+\]\([^)\s]+\))/g;

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function inline(text: string, keyPrefix = ""): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const token = match[0];
    const key = `${keyPrefix}${index}`;
    if (match[1])
      nodes.push(
        <code key={key} className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    else if (match[2]) nodes.push(<strong key={key}>{inline(token.slice(2, -2), `${key}-`)}</strong>);
    else if (match[3]) nodes.push(<s key={key}>{inline(token.slice(2, -2), `${key}-`)}</s>);
    else if (match[4] || match[5]) nodes.push(<em key={key}>{inline(token.slice(1, -1), `${key}-`)}</em>);
    else {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const url = token.slice(split + 2, -1);
      nodes.push(
        SAFE_URL.test(url) ? (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline underline-offset-2"
          >
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    last = index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

const HEADING_CLASS = ["text-lg font-semibold", "text-base font-semibold", "text-sm font-semibold"];

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  /** Consumes the consecutive lines matching `pattern` and returns their captured content. */
  const take = (pattern: RegExp) => {
    const items: string[] = [];
    for (let match = pattern.exec(lines[i] ?? ""); match && i < lines.length; match = pattern.exec(lines[i] ?? "")) {
      items.push(match[1] ?? "");
      i++;
    }
    return items;
  };
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const key = i;
    const heading = HEADING.exec(line);
    if (!line.trim()) i++;
    else if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i]?.startsWith("```"); i++) code.push(lines[i] ?? "");
      i++;
      blocks.push(
        <pre key={key} className="bg-muted overflow-x-auto rounded-lg p-3 font-mono text-xs">
          {code.join("\n")}
        </pre>,
      );
    } else if (heading) {
      i++;
      blocks.push(
        <p key={key} className={HEADING_CLASS[(heading[1]?.length ?? 1) - 1]}>
          {inline(heading[2] ?? "")}
        </p>,
      );
    } else if (BULLET.test(line)) {
      blocks.push(
        <ul key={key} className="list-disc space-y-0.5 pl-5">
          {take(BULLET).map((item, n) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items are positional
            <li key={n}>{inline(item)}</li>
          ))}
        </ul>,
      );
    } else if (ORDERED.test(line)) {
      blocks.push(
        <ol key={key} className="list-decimal space-y-0.5 pl-5">
          {take(ORDERED).map((item, n) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items are positional
            <li key={n}>{inline(item)}</li>
          ))}
        </ol>,
      );
    } else if (QUOTE.test(line)) {
      blocks.push(
        <blockquote key={key} className="text-muted-foreground border-l-2 pl-3">
          {inline(take(QUOTE).join(" "))}
        </blockquote>,
      );
    } else {
      const paragraph: string[] = [];
      const special = (l: string) => !l.trim() || HEADING.test(l) || BULLET.test(l) || ORDERED.test(l) || QUOTE.test(l);
      for (; i < lines.length && !special(lines[i] ?? "") && !lines[i]?.startsWith("```"); i++)
        paragraph.push(lines[i] ?? "");
      blocks.push(
        <p key={key} className="whitespace-pre-wrap">
          {inline(paragraph.join("\n"))}
        </p>,
      );
    }
  }
  return <div className="space-y-2 leading-relaxed break-words">{blocks}</div>;
}

/** One-line plain text preview of markdown, for table cells and cards. */
export const plainText = (text: string) =>
  text
    .replace(/```/g, "")
    .replace(/^\s*(#{1,3}|[-*>]|\d+[.)])\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|~~|`|\*)/g, "")
    .replace(/\s+/g, " ")
    .trim();
