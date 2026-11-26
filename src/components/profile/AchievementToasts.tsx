import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { onUnlock, type AchievementDef } from "../../lib/achievements";
import { playSfx } from "../../lib/sfx";
import "./profile.css";

/** Pops a toast (and the unlock fanfare) whenever an achievement unlocks, anywhere in the app. */
export function AchievementToasts() {
  const [toasts, setToasts] = useState<Array<{ key: number; def: AchievementDef }>>([]);
  useEffect(
    () =>
      onUnlock((def) => {
        const key = Date.now() + Math.random();
        setToasts((t) => [...t.slice(-2), { key, def }]);
        playSfx("achievement");
        window.setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), 4800);
      }),
    [],
  );
  if (toasts.length === 0) return null;
  return (
    <div className="ach-toasts" role="status" aria-live="polite">
      {toasts.map(({ key, def }) => (
        <div key={key} className="ach-toast">
          <span className="ach-toast-icon" aria-hidden="true">
            <Trophy size={20} />
          </span>
          <span>
            <small>Achievement unlocked</small>
            <strong>{def.label}</strong>
          </span>
        </div>
      ))}
    </div>
  );
}
