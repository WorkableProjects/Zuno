import { useEffect, useState } from "react";
import "./notepad.css";

interface Props {
  /** Where this device keeps the notes, e.g. per room and player. */
  storageKey: string;
  me: string;
  players: Array<{ id: string; name: string; removed?: boolean }>;
  /** Placeholder for the viewer's own page. */
  meHint?: string;
  className?: string;
}

/** Private notes, one page per player, kept only on this device. */
export function Notepad({ storageKey, me, players, meHint = "Your own notes…", className = "card hb-phone-card" }: Props) {
  const list = players.filter((p) => !p.removed);
  const [target, setTarget] = useState(me);
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(notes));
    } catch {
      /* storage unavailable: notes last for this visit */
    }
  }, [storageKey, notes]);
  const selected = list.some((p) => p.id === target) ? target : (list.find((p) => p.id === me)?.id ?? list[0]?.id ?? me);
  const who = list.find((p) => p.id === selected);
  const label = selected === me ? "Your notes" : `Notes about ${who?.name ?? "this player"}`;
  return (
    <section className={`${className} notepad`}>
      <h2 className="aside-title">Notepad</h2>
      <div className="notepad-tabs" role="tablist" aria-label="Notes about">
        {list.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === selected} className={`btn btn-sm ${p.id === selected ? "btn-secondary" : "btn-quiet"}`} onClick={() => setTarget(p.id)}>
            {p.id === me ? "Me" : p.name}
            {notes[p.id]?.trim() ? " •" : ""}
          </button>
        ))}
      </div>
      <textarea
        className="input notepad-text"
        value={notes[selected] ?? ""}
        maxLength={2000}
        placeholder={selected === me ? meHint : `${label}…`}
        aria-label={label}
        onChange={(e) => setNotes((n) => ({ ...n, [selected]: e.target.value }))}
      />
    </section>
  );
}
