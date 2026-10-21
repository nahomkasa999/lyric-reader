// A small markdown subset (v4.13) — the answers, rendered.
//
// The model writes plain markdown: paragraphs, **bold**, *italic*,
// `code`, ## and ### headings, - and 1. lists, and > quotes. That is
// all that is understood here.
//
// Two rules that never bend:
//   · the text is rendered as React text nodes — never as HTML, never
//     with dangerouslySetInnerHTML;
//   · anything that is not in the list above is rendered literally, so
//     a stray asterisk shows up as an asterisk instead of eating the
//     rest of the paragraph.
import type { ReactNode } from "react";

/** One block of the answer. */
type Block =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; text: string };

/** Cut the text into blocks. Pure — the same text, the same blocks. */
export function blocksOf(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  let ul: string[] = [];
  let ol: string[] = [];
  let quote: string[] = [];

  const flush = () => {
    if (para.length) {
      out.push({ kind: "p", text: para.join(" ").trim() });
      para = [];
    }
    if (ul.length) {
      out.push({ kind: "ul", items: ul });
      ul = [];
    }
    if (ol.length) {
      out.push({ kind: "ol", items: ol });
      ol = [];
    }
    if (quote.length) {
      out.push({ kind: "quote", text: quote.join(" ").trim() });
      quote = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      out.push({ kind: "h3", text: line.slice(4).trim() });
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      out.push({ kind: "h2", text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith("- ")) {
      if (quote.length || para.length) flush();
      ul.push(line.slice(2).trim());
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      if (quote.length || para.length) flush();
      ol.push(line.replace(/^\d+\.\s*/, "").trim());
      continue;
    }
    if (line.startsWith("> ")) {
      if (ul.length || ol.length) flush();
      quote.push(line.slice(2).trim());
      continue;
    }
    if (ul.length || ol.length || quote.length) flush();
    para.push(line.trim());
  }
  flush();
  return out;
}

/**
 * The inline marks of one line: **bold**, *italic* and `code`.
 *
 * An unmatched mark stays where it is — the text around it is still
 * shown, the mark is just a mark.
 */
export function inlineOf(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m = re.exec(text);
  let key = 0;
  while (m) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
    m = re.exec(text);
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Render an answer. */
export default function Markdown({ text }: { text: string }) {
  const blocks = blocksOf(text);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "h2")
          return (
            <h2 key={i} className="chat-h2">
              {inlineOf(b.text)}
            </h2>
          );
        if (b.kind === "h3")
          return (
            <h3 key={i} className="chat-h3">
              {inlineOf(b.text)}
            </h3>
          );
        if (b.kind === "ul")
          return (
            <ul key={i} className="chat-list">
              {b.items.map((it, j) => (
                <li key={j}>{inlineOf(it)}</li>
              ))}
            </ul>
          );
        if (b.kind === "ol")
          return (
            <ol key={i} className="chat-list">
              {b.items.map((it, j) => (
                <li key={j}>{inlineOf(it)}</li>
              ))}
            </ol>
          );
        if (b.kind === "quote")
          return (
            <blockquote key={i} className="chat-quote">
              {inlineOf(b.text)}
            </blockquote>
          );
        return (
          <p key={i} className="chat-p">
            {inlineOf(b.text)}
          </p>
        );
      })}
    </>
  );
}
