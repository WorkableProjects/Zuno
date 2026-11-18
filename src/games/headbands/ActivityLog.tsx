import { useEffect, useRef, useState } from "react";
import { LOG_FILTERS, describeLog, filterLog, type LogEntry, type LogFilter } from "./headbandsEngine";

interface Props {
  log: readonly LogEntry[];
  nameOf: (id: string) => string;
  /** Newest lines shown. The full log stays in the session. */
  limit?: number;
}

/** Everything that happened this game, newest first. Never shows an unsolved identity. */
export function ActivityLog({ log, nameOf, limit = 60 }: Props) {
  const list = useRef<HTMLOListElement>(null);
  const [filter, setFilter] = useState<LogFilter>("all");
  const newest = log.length;
  useEffect(() => {
    list.current?.scrollTo({ top: 0 });
  }, [newest]);

  if (log.length === 0) return <p className="meta">Nothing yet. Questions, guesses and skips show up here.</p>;
  const shown = filterLog(log, filter);
  const lines = shown.slice(-limit).reverse();
  return (
    <>
    <div className="hb-log-filters" role="group" aria-label="Filter activity">
      {LOG_FILTERS.map(([key, label]) => (
        <button key={key} type="button" className={`btn btn-sm ${filter === key ? "btn-primary" : "btn-quiet"}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
          {label}
        </button>
      ))}
    </div>
    {lines.length === 0 && <p className="meta">Nothing in this filter yet.</p>}
    <ol className="hb-log" ref={list} aria-live="polite" aria-relevant="additions">
      {lines.map((entry, i) => (
        <li key={shown.length - i} className={`hb-log-row hb-log-${entry.kind}${entry.kind === "guess" && entry.correct ? " is-correct" : ""}`}>
          <span className="hb-log-turn">T{entry.turn}</span>
          <span className="hb-log-text">{describeLog(entry, nameOf)}</span>
        </li>
      ))}
    </ol>
    </>
  );
}
