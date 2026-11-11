import { Fragment, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Plain text with math. `$...$` renders inline math, `$$...$$` renders display
 * math (KaTeX, trust off, so no HTML or links from the file). `\$` is a literal
 * dollar sign. Newlines become line breaks. Nothing else is interpreted.
 */
type Part = { kind: "text" | "inline" | "display"; value: string };

export function parseRichText(source: string): Part[] {
  const parts: Part[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) parts.push({ kind: "text", value: buf });
    buf = "";
  };
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\" && source[i + 1] === "$") {
      buf += "$";
      i += 2;
      continue;
    }
    if (ch === "$") {
      const display = source[i + 1] === "$";
      const open = display ? 2 : 1;
      const close = source.indexOf(display ? "$$" : "$", i + open);
      if (close > i + open) {
        flush();
        parts.push({ kind: display ? "display" : "inline", value: source.slice(i + open, close) });
        i = close + open;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return parts;
}

function renderMath(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false, trust: false, strict: "ignore", output: "html" });
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => parseRichText(text), [text]);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <Fragment key={i}>
            {p.value.split("\n").map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </Fragment>
        ) : (
          <span key={i} className={p.kind === "display" ? "math-display" : "math-inline"} dangerouslySetInnerHTML={{ __html: renderMath(p.value, p.kind === "display") }} />
        ),
      )}
    </span>
  );
}

/** Image attached to a clue or answer. src is an https or data URL already validated. */
export function ClueImage({ src, alt }: { src: string; alt: string }) {
  return <img className="clue-image" src={src} alt={alt} loading="eager" decoding="async" />;
}
