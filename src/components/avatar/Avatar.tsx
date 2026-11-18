import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  shrinkPhoto,
  type AvatarSpec,
} from "./avatarData";
import "./avatar.css";

export function Avatar({
  name,
  avatar,
  size = 44,
  className = "",
}: {
  name: string;
  avatar?: AvatarSpec | null;
  size?: number;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`avatar ${className}`}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: size * (avatar?.emoji ? 0.55 : 0.42),
        background: avatar?.color,
      }}
    >
      {avatar?.photo ? (
        <img src={avatar.photo} alt="" />
      ) : (
        (avatar?.emoji ?? initial)
      )}
    </span>
  );
}

/** Pick a colour, an emoji or a photo. Shows a live preview. */
export function AvatarPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: AvatarSpec;
  onChange: (next: AvatarSpec) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="avatar-picker field">
      <span className="field-label">Profile picture</span>
      <div className="avatar-picker-top">
        <Avatar name={name} avatar={value} size={64} />
        <div className="avatar-picker-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => file.current?.click()}
          >
            <Camera size={16} strokeWidth={1.5} />
            {value.photo ? "Change photo" : "Use a photo"}
          </button>
          {value.photo && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => onChange({ ...value, photo: null })}
            >
              <X size={16} strokeWidth={1.5} />
              Remove photo
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setProblem(null);
              shrinkPhoto(f)
                .then((photo) => onChange({ ...value, photo }))
                .catch((err: unknown) =>
                  setProblem(
                    err instanceof Error
                      ? err.message
                      : "Could not use that picture.",
                  ),
                );
            }}
          />
        </div>
      </div>
      {problem && <span className="field-hint avatar-problem">{problem}</span>}
      {!value.photo && (
        <>
          <div
            className="avatar-swatches"
            role="radiogroup"
            aria-label="Colour"
          >
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={value.color === c}
                aria-label={`Colour ${c}`}
                className={`avatar-swatch${value.color === c ? " is-active" : ""}`}
                style={{ background: c }}
                onClick={() => onChange({ ...value, color: c })}
              />
            ))}
          </div>
          <div className="avatar-emojis" role="radiogroup" aria-label="Emoji">
            <button
              type="button"
              role="radio"
              aria-checked={!value.emoji}
              className={`avatar-emoji${!value.emoji ? " is-active" : ""}`}
              onClick={() => onChange({ ...value, emoji: null })}
            >
              {name.trim().charAt(0).toUpperCase() || "A"}
            </button>
            {AVATAR_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={value.emoji === e}
                className={`avatar-emoji${value.emoji === e ? " is-active" : ""}`}
                onClick={() => onChange({ ...value, emoji: e })}
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
