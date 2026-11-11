import { useEffect, useRef } from "react";
import { describeLog, type LogEntry } from "./headbandsEngine";

interface Props {
  log: readonly LogEntry[];
  nameOf: (id: string) => string;
  /** Newest lines shown. The full log stays in the session. */
  limit?: number;
}

/** Everything that happened this game, newest first. Never shows an unsolved identity. */
export function ActivityLog({ log, nameOf, limit = 60 }: Props) {
  const list = useRef<HTMLOListElement>(null);
  const newest = log.length;
  useEffect(() => {
    list.current?.scrollTo({ top: 0 });
  }, [newest]);

  if (log.length === 0) return <p className="meta">Nothing yet. Questions, guesses and skips show up here.</p>;
  const lines = log.slice(-limit).reverse();
  return (
    <ol className="hb-log" ref={list} aria-live="polite" aria-relevant="additions">
      {lines.map((entry, i) => (
        <li key={log.length - i} className={`hb-log-row hb-log-${entry.kind}${entry.kind === "guess" && entry.correct ? " is-correct" : ""}`}>
          <span className="hb-log-turn">T{entry.turn}</span>
          <span className="hb-log-text">{describeLog(entry, nameOf)}</span>
        </li>
      ))}
    </ol>
  );
}
