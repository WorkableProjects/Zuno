import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { HeadbandsIdentity, HeadbandsMode } from "../../game-files/schema/headbands";

interface Props {
  identity: HeadbandsIdentity;
  mode: HeadbandsMode;
  size?: "lg" | "md" | "sm";
  /** Called once if the image cannot be shown. */
  onImageError?: () => void;
}

/**
 * One identity as the group sees it. Only render this where the assigned
 * player is not the one looking: it holds the answer in plain sight.
 */
export function IdentityCard({ identity, mode, size = "lg", onImageError }: Props) {
  const [failed, setFailed] = useState(false);
  if (mode === "text") {
    return (
      <div className={`id-card id-card-${size} id-card-text`}>
        <p className="id-text">{identity.text}</p>
      </div>
    );
  }
  return (
    <figure className={`id-card id-card-${size} id-card-image`}>
      <div className="id-image">
        {identity.image && !failed ? (
          <img
            src={identity.image}
            alt={`Picture: ${identity.subtext ?? ""}`}
            decoding="async"
            onError={() => {
              setFailed(true);
              onImageError?.();
            }}
          />
        ) : (
          <span className="id-image-missing">
            <ImageOff size={size === "sm" ? 18 : 32} strokeWidth={1.5} />
            {size !== "sm" && <span>Image unavailable</span>}
          </span>
        )}
      </div>
      <figcaption className="id-subtext">{identity.subtext}</figcaption>
    </figure>
  );
}
